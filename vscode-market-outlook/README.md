# Market Outlook Automation

This local VS Code extension refreshes `MarketOutlook.html` using the VS Code language model API backed by GitHub Copilot Chat authentication.

## Manual use

1. Open the `Reports` workspace in VS Code Insiders.
2. Run the command `Market Outlook: Update via Copilot`.

## Scheduled use

Run `RunMarketOutlookViaVSCode.bat` from Task Scheduler.

The batch file:

1. Launches VS Code Insiders with this extension in development mode.
2. Sets `MARKET_OUTLOOK_AUTORUN=1` so the extension refreshes on startup.
3. Sets `MARKET_OUTLOOK_EXIT_ON_COMPLETE=1` so VS Code closes after the run.

## Notes

- This path uses VS Code/Copilot authentication, not an external API key.
- The first run may require model-access consent inside VS Code.
- Because it uses extension development mode, VS Code may show development host messaging on first launch.