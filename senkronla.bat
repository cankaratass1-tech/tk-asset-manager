@echo off
chcp 65001 >nul
cd /d "%~dp0"
set DAL=yedek-2026-10-21
echo === Senkronlama basliyor (dal: %DAL%) ===

rem 1) Bu bilgisayardaki degisiklikleri kaydet (yerel ayar ve gorsel klasorleri haric)
git add -A -- . ":!backend/data/settings.enc.json" ":!yedekler" ":!maddeli-gorseller" ":!tipografi-gorseller"
git reset -q -- backend/data >nul 2>&1
git diff --cached --quiet
if errorlevel 1 (
  git commit -q -m "Senkron: %COMPUTERNAME% %DATE% %TIME%"
  echo Degisiklikler kaydedildi.
) else (
  echo Kaydedilecek yeni degisiklik yok.
)

rem 2) GitHub'daki guncellemeleri al
git pull --rebase --autostash origin %DAL%
if errorlevel 1 (
  git rebase --abort >nul 2>&1
  echo.
  echo HATA: Guncellemeler birlestirilemedi ^(iki bilgisayarda ayni dosya degismis olabilir^).
  echo Hicbir sey gonderilmedi, dosyalariniz oldugu gibi duruyor. Claude'a bu pencerenin yazisini gonderin.
  pause
  exit /b 1
)

rem 3) Kendi degisikliklerini GitHub'a gonder
git push origin HEAD:%DAL%
if errorlevel 1 (
  echo.
  echo HATA: Gonderilemedi. Internet baglantisini ve GitHub girisini kontrol edin.
  pause
  exit /b 1
)

echo.
echo === Tamam: bu bilgisayar GitHub ile esitlendi ===
pause
