@echo off
setlocal
if "%~1"=="" (
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\start-local-overlay.ps1"
  exit /b
)
if not defined TARTARUS_OVERLAY_EXE if exist "%~dp0desktop\node_modules\electron\dist\electron.exe" set "TARTARUS_OVERLAY_EXE=%~dp0desktop\node_modules\electron\dist\electron.exe"
if not defined TARTARUS_OVERLAY_EXE set "TARTARUS_OVERLAY_EXE=%LOCALAPPDATA%\Programs\tartarus-overlay\Tartarus Overlay.exe"
if not exist "%TARTARUS_OVERLAY_EXE%" (
  echo Tartarus Overlay was not found.
  echo Download the standalone release or build it with tools\build-standalone.ps1.
  pause
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE=1"
"%TARTARUS_OVERLAY_EXE%" "%~dp0tools\local-overlay.js" %*
if errorlevel 1 (
  pause
  exit /b 1
)
endlocal
