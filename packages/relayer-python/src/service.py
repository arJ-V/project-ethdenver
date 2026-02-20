import json
import logging
import time
from pathlib import Path
from typing import Dict, Set

from web3 import Web3

from .config import load_config


ASSET_LOCKED_EVENT_ABI = {
    "anonymous": False,
    "inputs": [
        {"indexed": True, "internalType": "uint256", "name": "assetId", "type": "uint256"},
        {"indexed": True, "internalType": "address", "name": "owner", "type": "address"},
        {"indexed": False, "internalType": "uint256", "name": "expectedYieldKWh", "type": "uint256"},
        {"indexed": False, "internalType": "uint256", "name": "lockTs", "type": "uint256"},
    ],
    "name": "AssetLocked",
    "type": "event",
}


def _load_state(path: Path) -> Dict[str, Set[str]]:
    if not path.exists():
        return {"processed": set()}
    raw = json.loads(path.read_text())
    return {"processed": set(raw.get("processed", []))}


def _save_state(path: Path, state: Dict[str, Set[str]]) -> None:
    path.write_text(json.dumps({"processed": sorted(list(state["processed"]))}, indent=2))


def mint_ysolar_on_hedera(beneficiary: str, amount_kwh: int) -> None:
    # Placeholder: teammate integrating Hedera SDK should replace this body.
    logging.info(
        "ACTION mint_ysolar status=queued beneficiary=%s amount_kwh=%s",
        beneficiary,
        amount_kwh,
    )


def push_oracle_update(yield_index: int) -> None:
    # Placeholder: teammate integrating web3 signer should replace this body.
    logging.info("ACTION push_oracle status=queued yield_index=%s", yield_index)


def ingest_telemetry_and_compute_index() -> int:
    # Placeholder: quick deterministic mock index for hackathon loop.
    return int(time.time()) % 1000 + 100


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    config = load_config()
    state_path = Path(config.local_state_file)
    state = _load_state(state_path)

    if not config.adi_rpc_url or not config.adi_vault_address:
        raise RuntimeError("Missing ADI_RPC_URL or ADI_VAULT_ADDRESS in environment")

    web3 = Web3(Web3.HTTPProvider(config.adi_rpc_url))
    contract = web3.eth.contract(
        address=Web3.to_checksum_address(config.adi_vault_address),
        abi=[ASSET_LOCKED_EVENT_ABI],
    )

    from_block = config.adi_start_block
    logging.info("Service started from_block=%s", from_block)

    while True:
        latest_index = ingest_telemetry_and_compute_index()
        logging.info("TELEMETRY yield_index=%s", latest_index)

        try:
            logs = contract.events.AssetLocked.get_logs(from_block=from_block, to_block="latest")
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
            owner = args["owner"]
            expected_yield_kwh = int(args["expectedYieldKWh"])

            logging.info(
                "EVENT asset_locked asset_id=%s owner=%s expected_yield_kwh=%s key=%s",
                asset_id,
                owner,
                expected_yield_kwh,
                event_key,
            )

            mint_ysolar_on_hedera(owner, expected_yield_kwh)
            push_oracle_update(latest_index)

            state["processed"].add(event_key)
            _save_state(state_path, state)

        from_block = "latest"
        time.sleep(4)


if __name__ == "__main__":
    main()
