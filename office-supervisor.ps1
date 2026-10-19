# Keeps the Pixel Office server (port 5180) running. Started hidden by launch-office.ps1.
# Paperclip and the brain are looked after by the office server itself (its watchdog), so this
# only needs to watch the one thing that can't restart itself: the office server.
#
# One copy at a time (named mutex). stop-office.ps1 writes .office\stopped and kills this
# process, so a deliberate stop stays stopped. ASCII only (Windows PowerShell 5 compatible).
$ErrorActionPreference = "Continue"
$root = $PSScriptRoot
$office = Join-Path $root ".office"
$stopFlag = Join-Path $office "stopped"
$pidFile = Join-Path $office "supervisor.pid"
$officeUrl = "http://127.0.0.1:5180"

$created = $false
$mutex = New-Object System.Threading.Mutex($true, "Local\PixelOfficeSupervisor", [ref]$created)
if (-not $created) { Write-Host "Supervisor already running."; exit 0 }

if (-not (Test-Path $office)) { New-Item -ItemType Directory -Path $office | Out-Null }
Set-Content -Path $pidFile -Value $PID -Encoding ascii
Remove-Item $stopFlag -ErrorAction SilentlyContinue

function Test-Up([string]$url) {
    try { (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 3).StatusCode -lt 500 } catch { $false }
}

function Start-Office {
    $log = Join-Path $root ".office-run.log"
    $cmd = "& '$root\start-office.ps1' *> '$log'"
    Start-Process -FilePath "pwsh" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $cmd) `
        -WorkingDirectory $root -WindowStyle Hidden
}

$failures = 0
$restarts = @()
try {
    while ($true) {
        if (Test-Path $stopFlag) { Write-Host "Stop requested."; break }
        if (Test-Up $officeUrl) {
            $failures = 0
        } else {
            $failures++
            $now = Get-Date
            $restarts = @($restarts | Where-Object { ($now - $_).TotalMinutes -lt 60 })
            if ($failures -ge 2 -and $restarts.Count -lt 5) {
                Write-Host "$(Get-Date -Format s) office server down; starting it."
                Start-Office
                $restarts += $now
                $failures = 0
                Start-Sleep -Seconds 30   # give it time to come up before checking again
            } elseif ($restarts.Count -ge 5) {
                Write-Host "$(Get-Date -Format s) office server keeps stopping; giving up for this hour."
            }
        }
        Start-Sleep -Seconds 30
    }
} finally {
    Remove-Item $pidFile -ErrorAction SilentlyContinue
    $mutex.ReleaseMutex()
}
