@echo off
setlocal
set HOST=127.0.0.1
set PORT=5015

if not "%~1"=="" set HOST=%~1
if not "%~2"=="" set PORT=%~2

powershell -ExecutionPolicy Bypass -File "%~dp0run_windows.ps1" -Host %HOST% -Port %PORT%

