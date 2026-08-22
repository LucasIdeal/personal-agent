@echo off
cd /d "%~dp0"
node scripts\bootstrap.mjs
if errorlevel 1 pause
