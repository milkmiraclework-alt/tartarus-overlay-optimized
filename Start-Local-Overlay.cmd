@echo off
setlocal
if not defined TARTARUS_OVERLAY_EXE set "TARTARUS_OVERLAY_EXE=%LOCALAPPDATA%\Programs\tartarus-overlay\Tartarus Overlay.exe"
if not exist "%TARTARUS_OVERLAY_EXE%" (
  echo Tartarus Overlay was not found.
  echo Install it first, or set TARTARUS_OVERLAY_EXE to its executable path.
  pause
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE=1"
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-local-overlay.ps1"
  exit /b
)
"%TARTARUS_OVERLAY_EXE%" "%~dp0tools\local-overlay.js" %*
if errorlevel 1 (
  pause
  exit /b 1
)
endlocal
