@echo off
title LingoTube AI Server
cd /d "%~dp0"
echo ====================================================
echo   Starting LingoTube AI Server on port 3000...
echo   URL: http://localhost:3000
echo ====================================================
node server.js
pause
