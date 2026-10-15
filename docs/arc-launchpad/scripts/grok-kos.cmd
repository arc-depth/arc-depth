@echo off
REM Wrapper for the scheduled Grok pulse. Exists because schtasks mangles a
REM /TR that contains quoted paths, and because having one file to run makes
REM the job easy to trigger by hand when checking it.
setlocal
set KOK=%~dp0..
cd /d "%KOK%"
if not exist "rapor\grok" mkdir "rapor\grok"
echo. >> "rapor\grok\zamanlanmis.log"
echo ==== %DATE% %TIME% ==== >> "rapor\grok\zamanlanmis.log"
node "scripts\grok-nabiz.js" %* >> "rapor\grok\zamanlanmis.log" 2>&1
exit /b %ERRORLEVEL%
