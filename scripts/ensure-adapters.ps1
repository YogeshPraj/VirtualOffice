# Registers this repo's external Paperclip adapters (GitHub Copilot) once Paperclip is up.
# Paperclip remembers installed adapters, so this is a no-op after the first successful run.
# Started in the background by launch-office.ps1.
$root = Split-Path $PSScriptRoot -Parent
$api = "http://127.0.0.1:3100/api"

for ($i = 0; $i -lt 180; $i++) {
    try { if ((Invoke-WebRequest "$api/health" -UseBasicParsing -TimeoutSec 2).Content -match '"status":"ok"') { break } } catch {}
    Start-Sleep -Seconds 1
}

$adapters = Invoke-RestMethod "$api/adapters"
$copilot = Join-Path $root "adapters\copilot-local"
if (-not ($adapters | Where-Object { $_.type -eq "copilot_local" }) -and (Test-Path (Join-Path $copilot "node_modules"))) {
    $body = @{ packageName = $copilot; isLocalPath = $true } | ConvertTo-Json
    Invoke-RestMethod "$api/adapters/install" -Method Post -Body $body -ContentType "application/json" | Out-Null
    Write-Host "Registered the GitHub Copilot adapter."
}
