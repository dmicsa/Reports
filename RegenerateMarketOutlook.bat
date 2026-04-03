@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
echo Running AI market outlook regeneration...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%regenerate_market_outlook.ps1" %*

if errorlevel 1 (
  echo.
  echo AI regeneration failed.
  exit /b 1
)

echo.
echo AI outlook regeneration complete.
exit /b 0