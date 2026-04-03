@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
set "WORKSPACE_DIR=%SCRIPT_DIR%"
set "EXT_DIR=%SCRIPT_DIR%vscode-market-outlook"
set "CODE_EXE=%LocalAppData%\Programs\Microsoft VS Code Insiders\Code - Insiders.exe"

if not exist "%CODE_EXE%" (
  set "CODE_EXE=code"
)

set "MARKET_OUTLOOK_AUTORUN=1"
set "MARKET_OUTLOOK_EXIT_ON_COMPLETE=1"

echo Launching VS Code automation for MarketOutlook...
start "" /min "%CODE_EXE%" "%WORKSPACE_DIR%" --new-window --extensionDevelopmentPath="%EXT_DIR%"

echo VS Code automation launched.
exit /b 0