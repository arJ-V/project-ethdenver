import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


@dataclass
class Config:
    adi_rpc_url: str
    adi_vault_address: str
    adi_start_block: str
    adi_operator_private_key: str
    hedera_operator_id: str
    hedera_operator_key: str
    hedera_rpc_url: str
    hedera_ysolar_address: str
    hedera_network: str
    telemetry_webhook_url: str
    telemetry_source: str
    telemetry_timeout_seconds: int
    oracle_contract_address: str
    oracle_admin_private_key: str
    oracle_push_threshold_seconds: int
    action_max_retries: int
    action_retry_backoff_seconds: int
    local_state_file: str


def load_config() -> Config:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    load_dotenv(dotenv_path=env_path, override=True)
    return Config(
        adi_rpc_url=os.getenv("ADI_RPC_URL", ""),
        adi_vault_address=os.getenv("ADI_VAULT_ADDRESS", ""),
        adi_start_block=os.getenv("ADI_START_BLOCK", "latest"),
        adi_operator_private_key=os.getenv("ADI_OPERATOR_PRIVATE_KEY", ""),
        hedera_operator_id=os.getenv("HEDERA_OPERATOR_ID", ""),
        hedera_operator_key=os.getenv("HEDERA_OPERATOR_KEY", ""),
        hedera_rpc_url=os.getenv("HEDERA_RPC_URL", "https://testnet.hashio.io/api"),
        hedera_ysolar_address=os.getenv("HEDERA_YSOLAR_ADDRESS", ""),
        hedera_network=os.getenv("HEDERA_NETWORK", "testnet"),
        telemetry_webhook_url=os.getenv("QUICKNODE_TELEMETRY_WEBHOOK_URL", ""),
        telemetry_source=os.getenv("TELEMETRY_SOURCE", "mock"),
        telemetry_timeout_seconds=int(os.getenv("TELEMETRY_TIMEOUT_SECONDS", "6")),
        oracle_contract_address=os.getenv("ORACLE_CONTRACT_ADDRESS", ""),
        oracle_admin_private_key=os.getenv("ORACLE_ADMIN_PRIVATE_KEY", ""),
        oracle_push_threshold_seconds=int(os.getenv("ORACLE_PUSH_THRESHOLD_SECONDS", "240")),
        action_max_retries=int(os.getenv("ACTION_MAX_RETRIES", "3")),
        action_retry_backoff_seconds=int(os.getenv("ACTION_RETRY_BACKOFF_SECONDS", "2")),
        local_state_file=os.getenv("LOCAL_STATE_FILE", ".relayer_state.json"),
    )
