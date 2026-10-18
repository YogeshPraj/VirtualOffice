# Starts the Pixel Office front end on http://127.0.0.1:5180 (needs Paperclip running: start-paperclip.ps1).
$root = $PSScriptRoot
$env:PATH = "$root\.tools\node;$env:PATH"
Set-Location "$root\pixel-office"
npx vite
