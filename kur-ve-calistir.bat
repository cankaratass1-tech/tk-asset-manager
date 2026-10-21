@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo Bagimliliklar kuruluyor...
pushd backend && call npm ci && popd
pushd varlik-takip-app && call npm ci && popd
start "Backend" cmd /k "cd /d %~dp0backend && node server.js"
start "Arayuz" cmd /k "cd /d %~dp0varlik-takip-app && npm run dev"
timeout /t 8 >nul
start http://localhost:5173
