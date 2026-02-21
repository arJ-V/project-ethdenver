import json
import logging
import time
from pathlib import Path
from typing import Dict, Set, Tuple

import requests
import psycopg2
from web3 import Web3
from web3.exceptions import TimeExhausted

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


def _mark_hedera_mint_done(database_url: str, adi_asset_id: int, hedera_tx_hash: str) -> None:
    """Update rwas so UI can show Hedera ySOLAR mint step (relayer polls ADI, mints on Hedera)."""
    try:
        conn = psycopg2.connect(database_url)
        conn.autocommit = True
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE rwas SET hedera_mint_tx_hash = %s, hedera_mint_status = %s WHERE adi_asset_id = %s",
                (hedera_tx_hash, "minted", adi_asset_id),
            )
        conn.close()
        logging.info("Updated rwas adi_asset_id=%s hedera_mint_tx_hash=%s", adi_asset_id, hedera_tx_hash)
    except Exception as exc:
        logging.warning("Failed to update rwas hedera_mint adi_asset_id=%s error=%s", adi_asset_id, exc)


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
    try:
        receipt = web3.eth.wait_for_transaction_receipt(tx_hash, timeout=300)
    except TimeExhausted:
        raise RuntimeError(
            f"Transaction not in chain after 300s tx={tx_hash.hex()} "
            "(network delay or dropped; check block explorer)"
        ) from None
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
    value: int,
) -> str:
    """
    Push oracle value to Hedera. Backend now sends asset price in cents; contract still calls it pushYieldIndex(uint256).
    Contract reverts if value == 0 (ZeroYieldIndex).
    """
    if value == 0:
        raise ValueError("oracle value must be non-zero (contract reverts with ZeroYieldIndex)")
    logging.info(
        "push_oracle_submit oracle=%s price_cents=%s (type=%s)",
        oracle_address,
        value,
        type(value).__name__,
    )
    oracle = hedera_web3.eth.contract(address=Web3.to_checksum_address(oracle_address), abi=ORACLE_MINIMAL_ABI)
    tx_hash = _build_and_send_tx(
        hedera_web3,
        oracle_account,
        oracle.functions.pushYieldIndex(value),
        gas_limit=250_000,
    )
    logging.info("ACTION push_oracle status=confirmed price_cents=%s tx=%s", value, tx_hash)
    return tx_hash


def _mock_yield_index() -> int:
    # Deterministic mock index for MVP while telemetry service is integrated in parallel.
    return int(time.time()) % 1000 + 100


def _quicknode_yield_index(config) -> int:
    if not config.telemetry_webhook_url:
        raise RuntimeError("QUICKNODE_TELEMETRY_WEBHOOK_URL is required when TELEMETRY_SOURCE=quicknode")
    response = requests.get(config.telemetry_webhook_url, timeout=config.telemetry_timeout_seconds)
    response.raise_for_status()
    payload = response.json()
    # Accept multiple teammate payload styles while keeping a stable adapter output.
    candidate = (
        payload.get("yieldIndex")
        or payload.get("yield_index")
        or (payload.get("data") or {}).get("yieldIndex")
        or (payload.get("data") or {}).get("yield_index")
    )
    if candidate is None:
        raise RuntimeError("QuickNode payload missing yieldIndex/yield_index")
    return int(candidate)


def ingest_telemetry_and_compute_index(config) -> int:
    source = (config.telemetry_source or "mock").lower()
    if source == "quicknode":
        return _quicknode_yield_index(config)
    return _mock_yield_index()


def _with_retry(action_name: str, fn, max_retries: int, backoff_seconds: int):
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            return fn()
        except Exception as exc:
            last_error = exc
            logging.warning(
                "ACTION_RETRY action=%s attempt=%s/%s error=%s",
                action_name,
                attempt,
                max_retries,
                exc,
            )
            if attempt < max_retries:
                time.sleep(backoff_seconds * attempt)
    raise RuntimeError(f"{action_name} failed after retries: {last_error}")


def _process_one_oracle_queue_row(
    database_url: str,
    hedera_web3: Web3,
    oracle_account,
    oracle_contract_address: str,
) -> bool:
    """
    Pop one row from oracle_pending_updates (backend enqueues asset price in cents), push to Hedera, delete row.
    Returns True if a row was processed, False if queue was empty.
    """
    conn = None
    row_id = None
    price_cents = None
    try:
        conn = psycopg2.connect(database_url)
        conn.autocommit = False
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, yield_index FROM oracle_pending_updates ORDER BY id ASC LIMIT 1 FOR UPDATE SKIP LOCKED"
            )
            row = cur.fetchone()
            if not row:
                return False
            row_id, price_cents = row
            price_cents = int(price_cents)
            cur.execute("DELETE FROM oracle_pending_updates WHERE id = %s", (row_id,))
        conn.commit()
    except Exception as exc:
        if conn:
            conn.rollback()
        logging.warning("oracle_queue select/delete error=%s", exc)
        return False
    finally:
        if conn:
            conn.close()

    try:
        push_oracle_update(hedera_web3, oracle_account, oracle_contract_address, price_cents)
        logging.info("oracle_queue consumed id=%s price_cents=%s (webhook path)", row_id, price_cents)
    except Exception as exc:
        logging.error("oracle_queue push failed price_cents=%s error=%s (row already deleted)", price_cents, exc)
    return True


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
    if not config.adi_rpc_url or not config.adi_vault_address:
        raise RuntimeError("Missing ADI_RPC_URL or ADI_VAULT_ADDRESS")

    adi_web3 = Web3(Web3.HTTPProvider(config.adi_rpc_url))
    hedera_web3 = Web3(Web3.HTTPProvider(config.hedera_rpc_url))
    operator_account, oracle_account = _load_accounts(config)
    logging.info(
        "Oracle pusher address=%s (must have ADMIN_ORACLE_ROLE on YieldOracle %s)",
        oracle_account.address,
        config.oracle_contract_address,
    )

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
        # (1) Webhook → backend → oracle_pending_updates: drain one row and push to Hedera oracle
        processed = _process_one_oracle_queue_row(
            config.database_url,
            hedera_web3,
            oracle_account,
            config.oracle_contract_address,
        )
        if processed:
            logging.info("ORACLE_QUEUE pushed one price_cents from queue (webhook path)")

        # (2) Poll ADI for YieldMintRequested; mint ySOLAR only (oracle updates come from queue above)
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
                tx_hash = mint_ysolar_on_hedera(
                    hedera_web3,
                    operator_account,
                    config.hedera_ysolar_address,
                    beneficiary,
                    expected_yield_kwh,
                )
                _mark_hedera_mint_done(config.database_url, asset_id, tx_hash)
            except Exception as exc:
                logging.error("Failed processing event key=%s error=%s", event_key, exc)
                continue

            state["processed"].add(event_key)
            _save_state(state_path, state)

        from_block = to_block + 1
        time.sleep(4)


if __name__ == "__main__":
    main()
