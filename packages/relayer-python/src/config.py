import os
from dataclasses import dataclass

from dotenv import load_dotenv


@dataclass
class Config:
    adi_rpc_url: str
    adi_vault_address: str
    adi_start_block: str
    hedera_operator_id: str
    hedera_operator_key: str
    hedera_ysolar_token_id: str
    hedera_network: str
    telemetry_webhook_url: str
    oracle_contract_address: str
    oracle_admin_private_key: str
    oracle_push_threshold_seconds: int
    local_state_file: str


def load_config() -> Config:
    load_dotenv()
    return Config(
        adi_rpc_url=os.getenv("ADI_RPC_URL", ""),
        adi_vault_address=os.getenv("ADI_VAULT_ADDRESS", ""),
        adi_start_block=os.getenv("ADI_START_BLOCK", "latest"),
        hedera_operator_id=os.getenv("HEDERA_OPERATOR_ID", ""),
        hedera_operator_key=os.getenv("HEDERA_OPERATOR_KEY", ""),
        hedera_ysolar_token_id=os.getenv("HEDERA_YSOLAR_TOKEN_ID", ""),
        hedera_network=os.getenv("HEDERA_NETWORK", "testnet"),
        telemetry_webhook_url=os.getenv("QUICKNODE_TELEMETRY_WEBHOOK_URL", ""),
        oracle_contract_address=os.getenv("ORACLE_CONTRACT_ADDRESS", ""),
        oracle_admin_private_key=os.getenv("ORACLE_ADMIN_PRIVATE_KEY", ""),
        oracle_push_threshold_seconds=int(os.getenv("ORACLE_PUSH_THRESHOLD_SECONDS", "240")),
        local_state_file=os.getenv("LOCAL_STATE_FILE", ".relayer_state.json"),
    )
