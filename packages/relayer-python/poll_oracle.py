#!/usr/bin/env python3
import argparse
import time
from datetime import datetime, timezone

from web3 import Web3

from src.config import load_config


ORACLE_READ_ABI = [
    {
        "inputs": [],
        "name": "getLatest",
        "outputs": [
            {"internalType": "uint256", "name": "yieldIndex", "type": "uint256"},
            {"internalType": "uint256", "name": "updatedAt", "type": "uint256"},
            {"internalType": "uint256", "name": "roundId", "type": "uint256"},
        ],
        "stateMutability": "view",
        "type": "function",
    }
]


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Poll YieldOracle.getLatest() repeatedly.")
    parser.add_argument(
        "--interval",
        type=float,
        default=5.0,
        help="Polling interval in seconds (default: 5)",
    )
    return parser.parse_args()


def main() -> None:
    args = _parse_args()
    config = load_config()

    if not config.hedera_rpc_url:
        raise RuntimeError("HEDERA_RPC_URL is required")
    if not config.oracle_contract_address:
        raise RuntimeError("ORACLE_CONTRACT_ADDRESS is required")

    web3 = Web3(Web3.HTTPProvider(config.hedera_rpc_url))
    oracle = web3.eth.contract(
        address=Web3.to_checksum_address(config.oracle_contract_address),
        abi=ORACLE_READ_ABI,
    )

    print(
        f"Polling oracle={config.oracle_contract_address} "
        f"rpc={config.hedera_rpc_url} interval={args.interval}s"
    )
    while True:
        now = int(time.time())
        yield_index, updated_at, round_id = oracle.functions.getLatest().call()
        updated_iso = datetime.fromtimestamp(int(updated_at), tz=timezone.utc).isoformat()
        lag_seconds = now - int(updated_at)
        print(
            f"{datetime.now(timezone.utc).isoformat()} "
            f"yieldIndex={int(yield_index)} roundId={int(round_id)} "
            f"updatedAt={int(updated_at)} ({updated_iso}) lag={lag_seconds}s"
        )
        time.sleep(max(0.1, args.interval))


if __name__ == "__main__":
    main()
