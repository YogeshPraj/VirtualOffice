# Stops the Virtual Office background servers (Paperclip on 3100, its database on 54329,
# Pixel Office on 5180, the second brain on 3131). Agents mid-run are interrupted; Paperclip recovers them on next start.
foreach ($port in 5180, 3100, 54329, 3131) {
    Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique |
        ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
}
Write-Host "Virtual Office stopped."
