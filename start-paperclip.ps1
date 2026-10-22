# Starts the Virtual Office (Paperclip) using the project-local Node 24.
# Data lives in .paperclip\ inside this folder; global Node is untouched.
#
# Paperclip is pinned so restarts never silently upgrade the API the Pixel Office
# depends on. To upgrade on purpose: change the version below, restart, then open
# the office and check each room still loads.
$PaperclipVersion = "2026.1012.0"

$root = $PSScriptRoot
# Bun is on PATH so employees' gstack skills (TypeScript helpers) can run.
$env:PATH = "$root\.tools\node;$root\.tools\bun;$env:PATH"
$env:PAPERCLIP_HOME = "$root\.paperclip"
# Run from a folder outside any git repo: Paperclip derives its own version commit from the
# git repo it starts in, and this folder is the Virtual Office repo (it would report our
# commit as Paperclip's and stamp it on exported skills). Data location is PAPERCLIP_HOME.
$neutral = Join-Path ([IO.Path]::GetTempPath()) "paperclip-cwd"
New-Item -ItemType Directory -Force $neutral | Out-Null
Set-Location $neutral
# setup.ps1 installs the pinned version into .tools\paperclip, so no npm is needed here (and
# employees keep this machine's own npm settings). Without it, fall back to npx.
$local = Join-Path $root ".tools\paperclip\node_modules\.bin\paperclipai.cmd"
$pkg = Join-Path $root ".tools\paperclip\node_modules\paperclipai\package.json"
if ((Test-Path $local) -and ((Get-Content $pkg -Raw | ConvertFrom-Json).version -eq $PaperclipVersion)) {
    & $local onboard --yes @args
} else {
    npx --yes "paperclipai@$PaperclipVersion" onboard --yes @args
}
