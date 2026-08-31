@echo off
title Push LingoTube AI to GitHub
color 0b
cd /d "%~dp0"

echo ========================================================
echo   [LingoTube AI] Dang tu dong day code len GitHub...
echo ========================================================
echo.

where git >nul 2>nul
if %ERRORLEVEL% neq 0 (
    color 0c
    echo [LOI] Khong tim thay Git tren may tinh cua ban!
    echo Vui long cai dat Git hoac kiem tra lai PATH.
    goto END
)

echo 1. Dang kiem tra thay doi (git add .)...
git add .
echo.

echo 2. Dang luu commit (git commit)...
git commit -m "fix: resolve syntax error, optimize UI and fix sidebar menu"
echo.

echo 3. Dang dong bo voi GitHub (git pull origin main)...
git pull origin main --rebase
echo.

echo 4. Dang day len GitHub (git push origin main)...
git push origin main
echo.

if %ERRORLEVEL% equ 0 (
    color 0a
    echo ========================================================
    echo   [THANH CONG] Code da duoc day len GitHub thanh cong!
    echo   Vercel dang tu dong deploy lai trong 20-30 giay.
    echo ========================================================
) else (
    color 0c
    echo ========================================================
    echo   [LUU Y] Co loi xay ra khi day code len GitHub.
    echo   Xem thong bao loi chi tiet o phia tren.
    echo ========================================================
)

:END
echo.
echo Nhan phim bat ky de dong cua so nay...
pause >nul
