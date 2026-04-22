@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0cleanup_windows.ps1" %*
