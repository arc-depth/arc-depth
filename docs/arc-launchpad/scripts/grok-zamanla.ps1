# ===========================================================================
# grok-zamanla.ps1 - registers the twice-daily Grok pulse with Windows Task
# Scheduler.
#
#   powershell -ExecutionPolicy Bypass -File scripts\grok-zamanla.ps1
#   powershell -ExecutionPolicy Bypass -File scripts\grok-zamanla.ps1 -Kaldir
#
# One task, two daily triggers: 10:00 and 20:00 local. The job itself is
# scripts\grok-nabiz.js via grok-kos.cmd, and it keeps its own spend
# ledger and refuses to run past the monthly cap - so a scheduler that
# fires more often than expected still cannot overspend.
#
# Registered through the ScheduledTasks module rather than schtasks /TR,
# which mangles any command line containing quoted paths.
#
# The task runs only while the user is logged on. That is deliberate: it
# needs no stored password, and the machine is a desktop that is on when
# it is in use anyway. A missed run is not worth a credential on disk.
#
# ASCII only. This file is read as ANSI and a UTF-8 character typed
# directly turns into mojibake.
# ===========================================================================

param([switch]$Kaldir)

$AD  = "ArcPulse-Grok-Nabiz"
$KOK = Split-Path -Parent $PSScriptRoot
$CMD = Join-Path $KOK "scripts\grok-kos.cmd"

if ($Kaldir) {
  Unregister-ScheduledTask -TaskName $AD -Confirm:$false -ErrorAction SilentlyContinue
  "silindi: $AD"
  exit 0
}

if (-not (Test-Path $CMD)) { "betik yok: $CMD"; exit 1 }
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { "node PATH'te yok"; exit 1 }
New-Item -ItemType Directory -Force -Path (Join-Path $KOK "rapor\grok") | Out-Null

$eylem = New-ScheduledTaskAction -Execute $CMD -WorkingDirectory $KOK
$tetik = @(
  (New-ScheduledTaskTrigger -Daily -At 10:00),
  (New-ScheduledTaskTrigger -Daily -At 20:00)
)
# StartWhenAvailable: a desktop that was asleep at 10:00 still gets its run.
# No RestartOnIdle, no repetition - two runs a day is the budget.
$ayar = New-ScheduledTaskSettingsSet -StartWhenAvailable `
          -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries `
          -ExecutionTimeLimit (New-TimeSpan -Minutes 15) `
          -MultipleInstances IgnoreNew
$kimlik = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
          -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $AD -Action $eylem -Trigger $tetik `
  -Settings $ayar -Principal $kimlik -Force `
  -Description "ARC PULSE: twice-daily xAI pulse of what is live on X. Spend-capped in grok-nabiz.js." |
  Out-Null

$g = Get-ScheduledTask -TaskName $AD
$b = $g | Get-ScheduledTaskInfo
"kuruldu : $AD"
"durum   : $($g.State)"
"sonraki : $($b.NextRunTime)"
"komut   : $CMD"
"log     : " + (Join-Path $KOK "rapor\grok\zamanlanmis.log")
