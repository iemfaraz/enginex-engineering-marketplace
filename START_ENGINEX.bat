@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
 echo Node.js is required. Install Node.js LTS, then run this file again.
 pause
 exit /b 1
)
echo Starting ENGINEX Engineering Marketplace...
start "ENGINEX" cmd /k "node server.js"
timeout /t 2 >nul
start "" http://localhost:3000
