@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\publish-fork.ps1" %*
exit /b %errorlevel%
