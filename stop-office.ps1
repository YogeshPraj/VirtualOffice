# Stops the Virtual Office background servers (Paperclip on 3100, its database on 54329,
# Pixel Office on 5180, the second brain on 3131). Agents mid-run are interrupted; Paperclip recovers them on next start.
# Stop the supervisor first, or it would start the office server again.
$office = Join-Path $PSScriptRoot ".office"
if (-not (Test-Path $office)) { New-Item -ItemType Directory -Path $office | Out-Null }
Set-Content -Path (Join-Path $office "stopped") -Value (Get-Date -Format s) -Encoding ascii
$pidFile = Join-Path $office "supervisor.pid"
if (Test-Path $pidFile) {
    $supervisor = Get-Content $pidFile -ErrorAction SilentlyContinue
    if ($supervisor) { Stop-Process -Id $supervisor -Force -ErrorAction SilentlyContinue }
    Remove-Item $pidFile -ErrorAction SilentlyContinue
}
foreach ($port in 5180, 3100, 54329, 3131) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
Write-Host "Virtual Office stopped."
