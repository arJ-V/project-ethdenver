import json
import logging
import time
from pathlib import Path
from typing import Dict, Set, Tuple

import psycopg2
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

# YieldOracle.pushYieldIndex(uint256 yieldIndex): reverts if yieldIndex==0 (ZeroYieldIndex);
# caller must have ADMIN_ORACLE_ROLE (else AccessControlUnauthorizedAccount(account, role) = 0xe2517d3f...)
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
        revert_msg = _get_revert_reason(web3, tx_builder, account.address, gas_limit)
        raise RuntimeError(
            f"Transaction failed tx={tx_hash.hex()} receipt_status={receipt.status} revert={revert_msg!r}"
        )
    return tx_hash.hex()


def _get_revert_reason(web3: Web3, tx_builder, from_address: str, gas_limit: int) -> str:
    """Simulate the call to get contract revert reason (e.g. ZeroYieldIndex, access control)."""
    try:
        tx = tx_builder.build_transaction(
            {
                "from": from_address,
                "gas": gas_limit,
                "chainId": web3.eth.chain_id,
            }
        )
        web3.eth.call(tx)
    except Exception as e:
        return str(e)
    return "unknown"


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
    # Contract: pushYieldIndex(uint256) reverts if yieldIndex == 0 (ZeroYieldIndex); caller must have ADMIN_ORACLE_ROLE
    if yield_index == 0:
        raise ValueError("yield_index must be non-zero (contract reverts with ZeroYieldIndex)")
    logging.info(
        "push_oracle_submit oracle=%s yield_index=%s (type=%s)",
        oracle_address,
        yield_index,
        type(yield_index).__name__,
    )
    oracle = hedera_web3.eth.contract(address=Web3.to_checksum_address(oracle_address), abi=ORACLE_MINIMAL_ABI)
    tx_hash = _build_and_send_tx(
        hedera_web3,
        oracle_account,
        oracle.functions.pushYieldIndex(yield_index),
        gas_limit=250_000,
    )
    logging.info("ACTION push_oracle status=confirmed yield_index=%s tx=%s", yield_index, tx_hash)
    return tx_hash


def _process_one_oracle_pending(
    config,
    hedera_web3: Web3,
    oracle_account,
) -> None:
    """Poll Postgres for one pending oracle update; push to Hedera and delete row on success."""
    conn = psycopg2.connect(config.database_url)
    try:
        cur = conn.cursor()
        cur.execute(
            "SELECT id, yield_index FROM oracle_pending_updates ORDER BY created_at ASC LIMIT 1"
        )
        row = cur.fetchone()
        if not row:
            cur.close()
            return
        row_id, yield_index_raw = row
        yield_index = int(yield_index_raw)
        logging.info(
            "oracle_pending_processing row_id=%s yield_index_raw=%s (type=%s) yield_index_int=%s",
            row_id,
            yield_index_raw,
            type(yield_index_raw).__name__,
            yield_index,
        )
        try:
            push_oracle_update(
                hedera_web3,
                oracle_account,
                config.oracle_contract_address,
                yield_index,
            )
            cur.execute("DELETE FROM oracle_pending_updates WHERE id = %s", (row_id,))
            conn.commit()
        except Exception as exc:
            conn.rollback()
            logging.warning(
                "Oracle push failed row_id=%s yield_index=%s error=%s type=%s",
                row_id,
                yield_index,
                exc,
                type(exc).__name__,
                exc_info=True,
            )
        finally:
            cur.close()
    finally:
        conn.close()


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

    if not config.hedera_rpc_url or not config.hedera_operator_key:
        raise RuntimeError("Missing HEDERA_RPC_URL or HEDERA_OPERATOR_KEY")
    if not config.hedera_ysolar_address:
        raise RuntimeError("Missing HEDERA_YSOLAR_ADDRESS")
    if not config.oracle_contract_address:
        raise RuntimeError("Missing ORACLE_CONTRACT_ADDRESS")
    if not config.database_url:
        raise RuntimeError("Missing DATABASE_URL (required for oracle queue from webhook)")

    hedera_web3 = Web3(Web3.HTTPProvider(config.hedera_rpc_url))
    operator_account, oracle_account = _load_accounts(config)
    logging.info(
        "Oracle pusher address=%s (must have ADMIN_ORACLE_ROLE on YieldOracle %s)",
        oracle_account.address,
        config.oracle_contract_address,
    )

    adi_web3 = None
    adi_contract = None
    from_block = None
    if config.adi_rpc_url and config.adi_vault_address:
        adi_web3 = Web3(Web3.HTTPProvider(config.adi_rpc_url))
        adi_contract = adi_web3.eth.contract(
            address=Web3.to_checksum_address(config.adi_vault_address),
            abi=[YIELD_MINT_REQUESTED_EVENT_ABI],
        )
        if config.adi_start_block.isdigit():
            from_block = int(config.adi_start_block)
        else:
            from_block = adi_web3.eth.block_number
        logging.info("ADI enabled from_block=%s operator=%s", from_block, operator_account.address)
    else:
        logging.info("ADI disabled (no ADI_RPC_URL/ADI_VAULT_ADDRESS); oracle queue only")

    while True:
        # 1) Process one pending oracle update from webhook queue (Postgres)
        _process_one_oracle_pending(config, hedera_web3, oracle_account)

        # 2) Poll ADI for YieldMintRequested; mint only (no oracle push)
        if adi_contract is not None and adi_web3 is not None and from_block is not None:
            try:
                to_block = adi_web3.eth.block_number
                if from_block <= to_block:
                    logs = adi_contract.events.YieldMintRequested.get_logs(
                        from_block=from_block, to_block=to_block
                    )
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
                        except Exception as exc:
                            logging.error("Failed processing event key=%s error=%s", event_key, exc)
                            continue

                        state["processed"].add(event_key)
                        _save_state(state_path, state)

                    from_block = to_block + 1
            except Exception as exc:
                logging.warning("Failed to fetch ADI logs: %s", exc)

        time.sleep(4)


if __name__ == "__main__":
    main()
