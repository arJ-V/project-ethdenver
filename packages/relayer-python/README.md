# relayer-python

Unified backend service for:
- QuickNode telemetry ingestion
- ADI vault event listening
- Hedera ySolar mint relay
- Oracle push updates before settlement windows

Before running, set these contract addresses in `.env`:
- `ADI_VAULT_ADDRESS`
- `HEDERA_YSOLAR_ADDRESS`
- `ORACLE_CONTRACT_ADDRESS`

Run with:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m src.service
```
