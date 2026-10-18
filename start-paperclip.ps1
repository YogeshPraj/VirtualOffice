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
npx --yes "paperclipai@$PaperclipVersion" onboard --yes @args
