# One-click launcher for the Virtual Office (used by the desktop shortcut).
# Starts Paperclip and the Pixel Office in the background if they aren't already running,
# then opens the office in an app-style window. Safe to double-click again at any time.
$root = $PSScriptRoot
$paperclipUrl = "http://127.0.0.1:3100/api/health"
$officeUrl = "http://127.0.0.1:5180"
$brainUrl = "http://127.0.0.1:3131/health"

function Test-Up([string]$url) {
    try { (Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 2).StatusCode -lt 500 } catch { $false }
}

function Start-Hidden([string]$script, [string]$log) {
    $cmd = "`$env:PAPERCLIP_NO_BROWSER='1'; & '$root\$script' *> '$root\$log'"
    Start-Process -FilePath "pwsh" -ArgumentList @("-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", $cmd) `
        -WorkingDirectory $root -WindowStyle Hidden
}

# The brain starts first: employees connect to it as soon as Paperclip wakes them.
if (-not (Test-Up $brainUrl)) { Start-Hidden "start-brain.ps1" ".brain-run.log" }
if (-not (Test-Up $paperclipUrl)) { Start-Hidden "start-paperclip.ps1" ".paperclip-run.log" }
if (-not (Test-Up $officeUrl)) { Start-Hidden "start-office.ps1" ".office-run.log" }
# Keep the office server running from now on (one copy only; stop-office.ps1 stops it).
Start-Hidden "office-supervisor.ps1" ".supervisor-run.log"
# Once Paperclip is up, make sure this repo's Copilot adapter is registered (no-op after first time).
Start-Hidden "scripts\ensure-adapters.ps1" ".adapters-run.log"

# The office page itself waits for Paperclip ("Unlocking the building..."), so only the
# fast front-end server needs to be ready before the window opens.
for ($i = 0; $i -lt 60 -and -not (Test-Up $officeUrl); $i++) { Start-Sleep -Milliseconds 500 }

# Prefer an Edge app window (no tabs or address bar); fall back to the default browser.
$edge = @(
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($edge) {
    Start-Process -FilePath $edge -ArgumentList "--app=$officeUrl", "--window-size=1440,900"
} else {
    Start-Process $officeUrl
}
