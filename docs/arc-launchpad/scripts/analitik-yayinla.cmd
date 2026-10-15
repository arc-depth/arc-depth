@echo off
REM Refresh the analytics snapshot and publish it if it changed.
REM Scheduled by scripts\analitik-zamanla.ps1. Only veri/analitik.json and
REM the GENESIS ATLAS data (veri/atlas.json, veri/atlas-gecmis.json) are
REM touched; nothing else in the mirror is committed by this job.
setlocal
set KOK=%~dp0..
set AYNA=C:\Users\omen\AppData\Local\Temp\claude\C--Users-omen\29ba58cd-5a89-4b3e-9b6e-2475a84ecc0e\scratchpad\yayin
cd /d "%KOK%"
if not exist "rapor" mkdir "rapor"
echo ==== %DATE% %TIME% ==== >> "rapor\analitik-yayin.log"
node "scripts\analitik-ozet.js" >> "rapor\analitik-yayin.log" 2>&1 || exit /b 1
REM GENESIS ATLAS: a new map window each run (a failure here must not stop
REM the analytics publish; the map keeps its last snapshot)
node "scripts\atlas-indeks.js" --pencere 900 >> "rapor\analitik-yayin.log" 2>&1
cd /d "%AYNA%"
git fetch -q origin >> "%KOK%\rapor\analitik-yayin.log" 2>&1
git merge --ff-only -q origin/main >> "%KOK%\rapor\analitik-yayin.log" 2>&1
copy /y "%KOK%\docs\veri\analitik.json" "docs\arc-launchpad\docs\veri\analitik.json" > nul
if exist "%KOK%\docs\veri\atlas.json" copy /y "%KOK%\docs\veri\atlas.json" "docs\arc-launchpad\docs\veri\atlas.json" > nul
if exist "%KOK%\docs\veri\atlas-gecmis.json" copy /y "%KOK%\docs\veri\atlas-gecmis.json" "docs\arc-launchpad\docs\veri\atlas-gecmis.json" > nul
git add docs/arc-launchpad/docs/veri/analitik.json docs/arc-launchpad/docs/veri/atlas.json docs/arc-launchpad/docs/veri/atlas-gecmis.json
git diff --cached --quiet && (echo degisiklik yok >> "%KOK%\rapor\analitik-yayin.log" & exit /b 0)
git commit -q -m "data: analytics snapshot" >> "%KOK%\rapor\analitik-yayin.log" 2>&1
git push -q origin yayin-main:main >> "%KOK%\rapor\analitik-yayin.log" 2>&1
exit /b %ERRORLEVEL%
