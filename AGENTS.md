# Reports workspace

## Funds performance report
- Generate: `D:\My\Work\Reports\.venv\Scripts\python.exe gen_funds_report.py`
- Venv: uv-managed (`uv venv .venv`; `uv pip install --python .venv\Scripts\python.exe yfinance`); recreate if the base interpreter path goes stale.
- Output: `funds_performance.html` (team standard format — Theme.css/Standard.js from https://dmicsa.github.io/HTMLAssets/, theme reference: `C:\Users\Dan\.config\opencode\html-template.md`)
- Data: 10Y AR/SD/SR computed live from 10y monthly dividend-adjusted NAV (yfinance); Sharpe vs 13-week T-bill (^IRX); Morningstar rating via yfinance.
