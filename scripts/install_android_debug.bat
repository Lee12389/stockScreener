@echo off
setlocal
powershell -ExecutionPolicy Bypass -File "%~dp0install_android_debug.ps1" %*
