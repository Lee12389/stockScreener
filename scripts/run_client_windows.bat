@echo off
setlocal
set TARGET=web
if not "%~1"=="" set TARGET=%~1
powershell -ExecutionPolicy Bypass -File "%~dp0run_client_windows.ps1" -Target %TARGET%
