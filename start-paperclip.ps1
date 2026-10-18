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
npx --yes "paperclipai@$PaperclipVersion" onboard --yes @args
