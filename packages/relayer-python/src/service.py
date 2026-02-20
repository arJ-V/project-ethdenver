import json
import logging
import time
from pathlib import Path
from typing import Dict, Set, Tuple

from web3 import Web3

from .config import load_config

YIELD_MINT_REQUESTED_EVENT_ABI = {
    "anonymous": False,
    "inputs": [
        {"indexed": True, "internalType": "uint256", "name": "assetId", "type": "uint256"},
        {"indexed": False, "internalType": "uint256", "name": "expectedYieldKWh", "type": "uint256"},
        {"indexed": True, "internalType": "address", "name": "beneficiary", "type": "address"},
    ],
    "name": "YieldMintRequested",
    "type": "event",
}

YSOLAR_MINIMAL_ABI = [
    {
        "inputs": [
            {"internalType": "address", "name": "to", "type": "address"},
            {"internalType": "uint256", "name": "amount", "type": "uint256"},
        ],
        "name": "mint",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]

ORACLE_MINIMAL_ABI = [
    {
        "inputs": [{"internalType": "uint256", "name": "yieldIndex", "type": "uint256"}],
        "name": "pushYieldIndex",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    }
]


def _load_state(path: Path) -> Dict[str, Set[str]]:
    if not path.exists():
        return {"processed": set()}
    raw = json.loads(path.read_text())
    return {"processed": set(raw.get("processed", []))}


def _save_state(path: Path, state: Dict[str, Set[str]]) -> None:
    path.write_text(json.dumps({"processed": sorted(list(state["processed"]))}, indent=2))


def _build_and_send_tx(
    web3: Web3,
    account,
    tx_builder,
    gas_limit: int,
) -> str:
    tx = tx_builder.build_transaction(
        {
            "from": account.address,
            "nonce": web3.eth.get_transaction_count(account.address, "pending"),
            "gas": gas_limit,
            "gasPrice": web3.eth.gas_price,
            "chainId": web3.eth.chain_id,
        }
    )
    signed = account.sign_transaction(tx)
    tx_hash = web3.eth.send_raw_transaction(signed.raw_transaction)
    receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=120)
    if receipt.status != 1:
        raise RuntimeError(f"Transaction failed tx={tx_hash.hex()}")
    return tx_hash.hex()


def mint_ysolar_on_hedera(
    hedera_web3: Web3,
    operator_account,
    ysolar_address: str,
    beneficiary: str,
    amount_kwh: int,
) -> str:
    ysolar = hedera_web3.eth.contract(address=Web3.to_checksum_address(ysolar_address), abi=YSOLAR_MINIMAL_ABI)
    tx_hash = _build_and_send_tx(
        hedera_web3,
        operator_account,
        ysolar.functions.mint(Web3.to_checksum_address(beneficiary), amount_kwh),
        gas_limit=300_000,
    )
    logging.info(
        "ACTION mint_ysolar status=confirmed beneficiary=%s amount_kwh=%s tx=%s",
        beneficiary,
        amount_kwh,
        tx_hash,
    )
    return tx_hash


def push_oracle_update(
    hedera_web3: Web3,
    oracle_account,
    oracle_address: str,
    yield_index: int,
) -> str:
    oracle = hedera_web3.eth.contract(address=Web3.to_checksum_address(oracle_address), abi=ORACLE_MINIMAL_ABI)
    tx_hash = _build_and_send_tx(
        hedera_web3,
        oracle_account,
        oracle.functions.pushYieldIndex(yield_index),
        gas_limit=250_000,
    )
    logging.info("ACTION push_oracle status=confirmed yield_index=%s tx=%s", yield_index, tx_hash)
    return tx_hash


def ingest_telemetry_and_compute_index() -> int:
    # Deterministic mock index for MVP while telemetry service is integrated in parallel.
    return int(time.time()) % 1000 + 100


def _load_accounts(config) -> Tuple[object, object]:
    operator_account = Web3().eth.account.from_key(config.hedera_operator_key)
    oracle_key = config.oracle_admin_private_key or config.hedera_operator_key
    oracle_account = Web3().eth.account.from_key(oracle_key)
    return operator_account, oracle_account


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    config = load_config()
    state_path = Path(config.local_state_file)
    state = _load_state(state_path)

    if not config.adi_rpc_url or not config.adi_vault_address:
        raise RuntimeError("Missing ADI_RPC_URL or ADI_VAULT_ADDRESS")
    if not config.hedera_rpc_url or not config.hedera_operator_key:
        raise RuntimeError("Missing HEDERA_RPC_URL or HEDERA_OPERATOR_KEY")
    if not config.hedera_ysolar_address:
        raise RuntimeError("Missing HEDERA_YSOLAR_ADDRESS")
    if not config.oracle_contract_address:
        raise RuntimeError("Missing ORACLE_CONTRACT_ADDRESS")

    adi_web3 = Web3(Web3.HTTPProvider(config.adi_rpc_url))
    hedera_web3 = Web3(Web3.HTTPProvider(config.hedera_rpc_url))
    operator_account, oracle_account = _load_accounts(config)

    adi_contract = adi_web3.eth.contract(
        address=Web3.to_checksum_address(config.adi_vault_address),
        abi=[YIELD_MINT_REQUESTED_EVENT_ABI],
    )

    if config.adi_start_block.isdigit():
        from_block = int(config.adi_start_block)
    else:
        from_block = adi_web3.eth.block_number

    logging.info("Service started from_block=%s operator=%s", from_block, operator_account.address)

    while True:
        latest_index = ingest_telemetry_and_compute_index()
        logging.info("TELEMETRY yield_index=%s", latest_index)

        try:
            to_block = adi_web3.eth.block_number
            if from_block > to_block:
                time.sleep(4)
                continue
            logs = adi_contract.events.YieldMintRequested.get_logs(from_block=from_block, to_block=to_block)
        except Exception as exc:
            logging.warning("Failed to fetch logs error=%s", exc)
            time.sleep(4)
            continue

        for log in logs:
            event_key = f"{log['blockNumber']}:{log['transactionHash'].hex()}:{log['logIndex']}"
            if event_key in state["processed"]:
                continue

            args = log["args"]
            asset_id = int(args["assetId"])
            expected_yield_kwh = int(args["expectedYieldKWh"])
            beneficiary = args["beneficiary"]

            logging.info(
                "EVENT yield_mint_requested asset_id=%s beneficiary=%s expected_yield_kwh=%s key=%s",
                asset_id,
                beneficiary,
                expected_yield_kwh,
                event_key,
            )

            try:
                mint_ysolar_on_hedera(
                    hedera_web3,
                    operator_account,
                    config.hedera_ysolar_address,
                    beneficiary,
                    expected_yield_kwh,
                )
                push_oracle_update(
                    hedera_web3,
                    oracle_account,
                    config.oracle_contract_address,
                    latest_index,
                )
            except Exception as exc:
                logging.error("Failed processing event key=%s error=%s", event_key, exc)
                continue

            state["processed"].add(event_key)
            _save_state(state_path, state)

        from_block = to_block + 1
        time.sleep(4)


if __name__ == "__main__":
    main()
