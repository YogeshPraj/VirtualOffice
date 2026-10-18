<#
.SYNOPSIS
  Refreshes company\paperclip-export (your private company repo) from the running Paperclip.

.DESCRIPTION
  Overwrites company\paperclip-export with a fresh `paperclipai company export` (it refuses to
  overwrite without --force). Secret values are never exported. Bundled skills are stamped
  with the commit the Paperclip *server* reports, which is why start-paperclip.ps1 starts it
  outside any git repo. Review `git -C company diff`, then commit and push.

.PARAMETER CompanyId
  Optional. Defaults to the only company on this Paperclip instance.
#>
param([string]$CompanyId)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$env:PATH = "$root\.tools\node;$env:PATH"
$env:PAPERCLIP_HOME = "$root\.paperclip"
$version = ([regex]::Match((Get-Content "$root\start-paperclip.ps1" -Raw), '\$PaperclipVersion = "([^"]+)"')).Groups[1].Value

if (-not $CompanyId) {
    $companies = Invoke-RestMethod "http://127.0.0.1:3100/api/companies"
    if (@($companies).Count -ne 1) { throw "Several companies exist; pass -CompanyId <id>." }
    $CompanyId = $companies[0].id
}

$out = Join-Path $root "company\paperclip-export"
Push-Location $root
try {
    $result = npx --yes "paperclipai@$version" company export $CompanyId --out $out --include company,agents,skills,projects --force 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or $result -notmatch '"ok":\s*true') { throw "Export failed:`n$result" }
} finally { Pop-Location }

Write-Host "Exported to $out"
git -C (Join-Path $root "company") status --short
