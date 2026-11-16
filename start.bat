@echo off
cd /d "%~dp0"
echo Starting LaoRum ERP... keep this window open while the restaurant is working.
node --disable-warning=ExperimentalWarning server.js
pause
