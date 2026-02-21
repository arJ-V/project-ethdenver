from dataclasses import dataclass

from web3 import Web3


ADI_VAULT_MINIMAL_ABI = [
    {
        "inputs": [{"internalType": "address", "name": "to", "type": "address"}],
        "name": "mintAsset",
        "outputs": [{"internalType": "uint256", "name": "assetId", "type": "uint256"}],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "inputs": [
            {"internalType": "uint256", "name": "assetId", "type": "uint256"},
            {"internalType": "uint256", "name": "expectedYieldKWh", "type": "uint256"},
            {"internalType": "address", "name": "beneficiary", "type": "address"},
        ],
        "name": "lockAsset",
        "outputs": [],
        "stateMutability": "nonpayable",
        "type": "function",
    },
    {
        "anonymous": False,
        "inputs": [
            {"indexed": True, "internalType": "uint256", "name": "assetId", "type": "uint256"},
            {"indexed": True, "internalType": "address", "name": "owner", "type": "address"},
        ],
        "name": "AssetMinted",
        "type": "event",
    },
]


@dataclass
class AdiBootstrapResult:
    asset_id: int
    owner: str
    lock_tx_hash: str
    mint_tx_hash: str


def operator_address_from_key(private_key: str) -> str:
    """Derive the operator (account) address from the ADI operator private key."""
    account = Web3().eth.account.from_key(private_key)
    return account.address


def bootstrap_rwa_on_adi(
    *,
    adi_rpc_url: str,
    vault_address: str,
    operator_private_key: str,
    beneficiary: str,
    expected_yield_kwh: int,
) -> AdiBootstrapResult:
    web3 = Web3(Web3.HTTPProvider(adi_rpc_url))
    if not web3.is_connected():
        raise RuntimeError("Failed to connect to ADI RPC")

    if not Web3.is_address(vault_address):
        raise ValueError("Invalid ADI vault address")
    if not Web3.is_address(beneficiary):
        raise ValueError("Invalid beneficiary address")
    if expected_yield_kwh <= 0:
        raise ValueError("expected_yield_kwh must be positive")

    account = web3.eth.account.from_key(operator_private_key)
    chain_id = web3.eth.chain_id
    contract = web3.eth.contract(address=Web3.to_checksum_address(vault_address), abi=ADI_VAULT_MINIMAL_ABI)

    nonce = web3.eth.get_transaction_count(account.address, "pending")
    mint_tx = contract.functions.mintAsset(account.address).build_transaction(
        {
            "from": account.address,
            "nonce": nonce,
            "gas": 600_000,
            "gasPrice": web3.eth.gas_price,
            "chainId": chain_id,
        }
    )
    signed_mint = account.sign_transaction(mint_tx)
    mint_tx_hash = web3.eth.send_raw_transaction(signed_mint.raw_transaction)
    mint_receipt = web3.eth.wait_for_transaction_receipt(mint_tx_hash, timeout=300)
    if mint_receipt.status != 1:
        raise RuntimeError(f"mintAsset transaction failed: {mint_tx_hash.hex()}")

    minted_events = contract.events.AssetMinted().process_receipt(mint_receipt)
    if not minted_events:
        raise RuntimeError("Unable to parse AssetMinted event from mintAsset receipt")
    asset_id = int(minted_events[0]["args"]["assetId"])

    # Use fresh nonce for lock tx after mint confirmed (avoids nonce reuse if chain state changed)
    lock_nonce = web3.eth.get_transaction_count(account.address, "pending")
    lock_tx = contract.functions.lockAsset(asset_id, int(expected_yield_kwh), Web3.to_checksum_address(beneficiary)).build_transaction(
        {
            "from": account.address,
            "nonce": lock_nonce,
            "gas": 800_000,
            "gasPrice": web3.eth.gas_price,
            "chainId": chain_id,
        }
    )
    signed_lock = account.sign_transaction(lock_tx)
    lock_tx_hash = web3.eth.send_raw_transaction(signed_lock.raw_transaction)
    lock_receipt = web3.eth.wait_for_transaction_receipt(lock_tx_hash, timeout=300)
    if lock_receipt.status != 1:
        raise RuntimeError(f"lockAsset transaction failed: {lock_tx_hash.hex()}")

    return AdiBootstrapResult(
        asset_id=asset_id,
        owner=account.address,
        lock_tx_hash=lock_tx_hash.hex(),
        mint_tx_hash=mint_tx_hash.hex(),
    )
