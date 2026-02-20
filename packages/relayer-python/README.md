# relayer-python

Unified backend service for:
- QuickNode telemetry ingestion
- ADI vault event listening
- Hedera ySolar mint relay
- Oracle push updates before settlement windows

Run with:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m src.service
```
