<#
.SYNOPSIS
  One-time setup of the Virtual Office on a Windows machine. Safe to re-run: every step
  checks first and skips what is already done.

.DESCRIPTION
  Installs portable Node 24 and Bun into .tools\ (system Node/Bun are left alone), installs
  the npm packages, gstack (Claude Code skills), GBrain (the second brain) with its tokens,
  connects the brain to Claude Code and GitHub Copilot CLI, and puts a "Virtual Office" icon on
  the desktop. Paperclip itself needs no install: the launcher runs the pinned version via npx.

.PARAMETER SkipGlobal
  Only set up this folder (runtimes + npm packages). Skips gstack, GBrain, MCP registration
  and shortcuts, which change things in your user profile.

.EXAMPLE
  pwsh -ExecutionPolicy Bypass -File .\setup.ps1
#>
param([switch]$SkipGlobal)

$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$tools = Join-Path $root ".tools"
# The office's packages come from the public npm registry, whatever this machine's own npm
# settings say (a work laptop's company registry would otherwise fail with E401).
. (Join-Path $root "scripts\office-npm.ps1")
$results = [System.Collections.Generic.List[object]]::new()

function Step([string]$name, [scriptblock]$body) {
    Write-Host "`n== $name" -ForegroundColor Cyan
    try {
        $note = & $body
        $results.Add([pscustomobject]@{ Step = $name; Result = "ok"; Note = "$note" })
    } catch {
        Write-Host "   $($_.Exception.Message)" -ForegroundColor Red
        $results.Add([pscustomobject]@{ Step = $name; Result = "FAILED"; Note = $_.Exception.Message })
    }
}

function Have([string]$cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Get-Verified([string]$url, [string]$sumsUrl, [string]$fileName, [string]$dest) {
    Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing
    # GitHub serves release assets as application/octet-stream, so Content can be bytes.
    $sums = (Invoke-WebRequest -Uri $sumsUrl -UseBasicParsing).Content
    if ($sums -is [byte[]]) { $sums = [System.Text.Encoding]::UTF8.GetString($sums) }
    $line = $sums -split "`n" | Where-Object { $_ -match "\s\*?$([regex]::Escape($fileName))\s*$" } | Select-Object -First 1
    if (-not $line) { throw "No checksum published for $fileName" }
    $expected = ($line -split "\s+")[0].ToLower()
    $actual = (Get-FileHash $dest -Algorithm SHA256).Hash.ToLower()
    if ($expected -ne $actual) { Remove-Item $dest -Force; throw "Checksum mismatch for $fileName" }
}

# -- 1. Prerequisites --------------------------------------------------------
Step "Prerequisites" {
    if (-not (Have git)) { throw "Git for Windows is required: winget install --id Git.Git -e" }
    $missing = @()
    if (-not (Have claude)) { $missing += "Claude Code CLI (npm i -g @anthropic-ai/claude-code) for Claude employees" }
    if (-not (Have copilot)) { $missing += "GitHub Copilot CLI (winget install GitHub.Copilot) for Copilot employees" }
    if (-not (Have python)) { $missing += "Python 3 for scripts\*.py" }
    if (-not (Have az)) { $missing += "Azure CLI for ADO work items at the intake desk (winget install Microsoft.AzureCLI; az extension add --name azure-devops; az login)" }
    if (-not (Have gh)) { $missing += "GitHub CLI for GitHub issues/PRs at the intake desk (winget install GitHub.cli; gh auth login)" }
    foreach ($m in $missing) { Write-Host "   optional, not found: $m" -ForegroundColor Yellow }
    if ($missing.Count) { "missing optional: $($missing.Count)" } else { "all present" }
}

# -- 2. Portable Node 24 -----------------------------------------------------
Step "Node 24 (portable, .tools\node)" {
    $node = Join-Path $tools "node\node.exe"
    if (Test-Path $node) {
        $v = (& $node -v).TrimStart("v")
        if ([version]$v -ge [version]"24.11.0") { return "already v$v" }
    }
    $index = Invoke-RestMethod "https://nodejs.org/dist/index.json"
    $ver = ($index | Where-Object { $_.version -like "v24.*" } | Select-Object -First 1).version
    $file = "node-$ver-win-x64.zip"
    New-Item -ItemType Directory -Force $tools | Out-Null
    $zip = Join-Path $tools $file
    Get-Verified "https://nodejs.org/dist/$ver/$file" "https://nodejs.org/dist/$ver/SHASUMS256.txt" $file $zip
    Expand-Archive $zip -DestinationPath $tools -Force
    Remove-Item (Join-Path $tools "node") -Recurse -Force -ErrorAction SilentlyContinue
    Rename-Item (Join-Path $tools "node-$ver-win-x64") "node"
    Remove-Item $zip -Force
    "installed $ver"
}

# -- 3. Portable Bun ---------------------------------------------------------
Step "Bun (portable, .tools\bun)" {
    $bun = Join-Path $tools "bun\bun.exe"
    if (-not (Test-Path $bun)) {
        $tag = (Invoke-RestMethod "https://api.github.com/repos/oven-sh/bun/releases/latest").tag_name
        $file = "bun-windows-x64.zip"
        New-Item -ItemType Directory -Force (Join-Path $tools "bun") | Out-Null
        $zip = Join-Path $tools $file
        Get-Verified "https://github.com/oven-sh/bun/releases/download/$tag/$file" "https://github.com/oven-sh/bun/releases/download/$tag/SHASUMS256.txt" $file $zip
        $tmp = Join-Path $tools "bun-unzip"
        Expand-Archive $zip -DestinationPath $tmp -Force
        Move-Item (Join-Path $tmp "bun-windows-x64\bun.exe") $bun -Force
        Remove-Item $zip, $tmp -Recurse -Force
    }
    # Bun's own installer ships bunx as a copy of bun.exe; gstack's setup calls bunx.
    Copy-Item $bun (Join-Path $tools "bun\bunx.exe") -Force
    "v$(& $bun --version)"
}

$env:PATH = "$tools\node;$tools\bun;$env:PATH"

# -- 4. npm packages ---------------------------------------------------------
Step "npm packages (pixel-office, adapters\copilot-local)" {
    $done = @()
    foreach ($dir in "pixel-office", "adapters\copilot-local") {
        $path = Join-Path $root $dir
        $lock = Join-Path $path "package-lock.json"
        $installed = Join-Path $path "node_modules\.package-lock.json"
        # Up to date when npm's own record of the install is newer than the lockfile.
        if ((Test-Path $installed) -and (Get-Item $installed).LastWriteTime -ge (Get-Item $lock).LastWriteTime) { continue }
        # npm ci deletes node_modules first; a running office keeps esbuild.exe locked, so
        # reinstalling over a live install would fail halfway and break it. Refuse instead.
        if ((Test-Path (Join-Path $path "node_modules")) -and (Get-NetTCPConnection -LocalPort 5180 -State Listen -ErrorAction SilentlyContinue)) {
            throw "The Virtual Office is running. Double-click 'Stop Virtual Office' (in this folder), then re-run setup.ps1."
        }
        Push-Location $path
        try {
            & npm ci --no-audit --no-fund --loglevel=error
            if ($LASTEXITCODE -ne 0) { throw "npm ci failed in $dir" }
        } finally { Pop-Location }
        $done += $dir
    }
    if ($done.Count) { "installed: $($done -join ', ')" } else { "already up to date" }
}

# -- 4b. Paperclip, installed here --------------------------------------------
# Installed once into .tools\paperclip, so starting the office never needs npm (or this machine's
# npm settings, which employees keep using for their own work).
Step "Paperclip (pinned, .tools\paperclip)" {
    $version = ([regex]::Match((Get-Content (Join-Path $root "start-paperclip.ps1") -Raw), '\$PaperclipVersion = "([^"]+)"')).Groups[1].Value
    $dir = Join-Path $tools "paperclip"
    $pkg = Join-Path $dir "node_modules\paperclipai\package.json"
    if ((Test-Path $pkg) -and ((Get-Content $pkg -Raw | ConvertFrom-Json).version -eq $version)) { return "already $version" }
    New-Item -ItemType Directory -Force $dir | Out-Null
    & npm install --prefix $dir "paperclipai@$version" --no-audit --no-fund --loglevel=error
    if ($LASTEXITCODE -ne 0) { throw "npm install paperclipai@$version failed" }
    "installed $version"
}

if ($SkipGlobal) {
    Write-Host "`n-SkipGlobal: skipping gstack, GBrain, MCP registration and shortcuts." -ForegroundColor Yellow
} else {
    # -- 5. gstack -----------------------------------------------------------
    Step "gstack (Claude Code skills, ~\.claude\skills\gstack)" {
        $gstack = Join-Path $HOME ".claude\skills\gstack"
        if (Test-Path (Join-Path $gstack "bin\gstack-doctor")) { return "already installed" }
        if (-not (Test-Path $gstack)) {
            & git clone --single-branch --depth 1 https://github.com/garrytan/gstack.git $gstack
            if ($LASTEXITCODE -ne 0) { throw "git clone of gstack failed" }
        }
        # No plan-tune or timeline hooks: keep ~/.claude/settings.json untouched.
        & pwsh -NoProfile -ExecutionPolicy Bypass -File (Join-Path $gstack "setup.ps1") --host claude --no-plan-tune-hooks --no-timeline-stop-hook
        if ($LASTEXITCODE -ne 0) { throw "gstack setup failed (see output above)" }
        "installed"
    }

    # -- 6. GBrain + tokens --------------------------------------------------
    $gbrainCli = Join-Path $HOME ".bun\install\global\node_modules\gbrain\src\cli.ts"
    $brainDir = Join-Path $root ".brain"
    Step "GBrain (second brain, ~\.gbrain)" {
        if (-not (Test-Path $gbrainCli)) {
            # GBrain is NOT on npm (the npm "gbrain" is unrelated); install from GitHub only.
            & bun install -g github:garrytan/gbrain
            if ($LASTEXITCODE -ne 0) { throw "bun install -g github:garrytan/gbrain failed" }
        }
        if (-not (Test-Path (Join-Path $HOME ".gbrain\brain.pglite"))) {
            & bun $gbrainCli init --pglite --no-embedding | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "gbrain init failed" }
        }
        New-Item -ItemType Directory -Force $brainDir | Out-Null
        $minted = @()
        foreach ($name in "employees", "ceo-office") {
            $file = Join-Path $brainDir "$name.token"
            if (Test-Path $file) { continue }
            $out = & bun $gbrainCli auth create $name --scopes "read,write" 2>&1 | Out-String
            $tok = [regex]::Match($out, "gbrain_[A-Za-z0-9_\-]+").Value
            if (-not $tok) { throw "Could not mint the $name token (is the brain server running? stop it first): $out" }
            Set-Content -Path $file -Value $tok -NoNewline
            $minted += $name
        }
        icacls $brainDir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" | Out-Null
        if ($minted.Count) { "tokens minted: $($minted -join ', ')" } else { "brain and tokens already present" }
    }

    # -- 7. Connect the brain to Claude Code and Copilot CLI -----------------
    Step "Brain MCP for Claude Code and Copilot CLI" {
        $tokFile = Join-Path $brainDir "employees.token"
        if (-not (Test-Path $tokFile)) { throw "No employees token; the GBrain step must succeed first" }
        $tok = (Get-Content $tokFile -Raw).Trim()
        $url = "http://127.0.0.1:3131/mcp"
        $done = @()
        if (Have claude) {
            $cur = (& claude mcp get gbrain 2>&1 | Out-String)
            if ($cur -notmatch [regex]::Escape($url)) {
                & claude mcp remove gbrain -s user 2>&1 | Out-Null
                & claude mcp add --transport http --scope user gbrain $url --header "Authorization: Bearer $tok" | Out-Null
            }
            $done += "claude"
        }
        if (Have copilot) {
            $cur = (& copilot mcp get gbrain 2>&1 | Out-String)
            if ($cur -notmatch [regex]::Escape($url)) {
                & copilot mcp remove gbrain 2>&1 | Out-Null
                & copilot mcp add --transport http gbrain $url --header "Authorization: Bearer $tok" | Out-Null
            }
            $done += "copilot"
        }
        if ($done.Count) { "registered for: $($done -join ', ')" } else { "no Claude or Copilot CLI found; skipped" }
    }

    # -- 8. Shortcuts --------------------------------------------------------
    Step "Desktop icon" {
        $pwshExe = (Get-Command pwsh).Source
        $shell = New-Object -ComObject WScript.Shell
        foreach ($s in @(
            @{ Path = (Join-Path ([Environment]::GetFolderPath("Desktop")) "Virtual Office.lnk"); Script = "launch-office.ps1"; Desc = "Start the Virtual Office and open it" },
            @{ Path = (Join-Path $root "Stop Virtual Office.lnk"); Script = "stop-office.ps1"; Desc = "Stop the Virtual Office background servers" }
        )) {
            $lnk = $shell.CreateShortcut($s.Path)
            $lnk.TargetPath = $pwshExe
            $lnk.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$root\$($s.Script)`""
            $lnk.WorkingDirectory = $root
            $lnk.IconLocation = "$root\assets\office.ico,0"
            $lnk.WindowStyle = 7
            $lnk.Description = $s.Desc
            $lnk.Save()
        }
        "desktop: Virtual Office - folder: Stop Virtual Office"
    }
}

# -- Summary ----------------------------------------------------------------
Write-Host ""
$results | Format-Table -AutoSize | Out-String | Write-Host
if ($results.Result -contains "FAILED") {
    Write-Host "Some steps failed. Fix them and re-run setup.ps1; finished steps are skipped." -ForegroundColor Red
    exit 1
}
Write-Host @"
Next:
  1. Sign in once: 'claude auth login' and/or 'copilot login'.
  2. Double-click 'Virtual Office' on the desktop. First start takes a minute or two.
  3. New company: create it in the pixel office and hire in HR.
     Existing company: clone your private company repo into .\company and import
     .\company\paperclip-export (see company\README.md).
  4. Handbook: copy brain\ceo-handbook.template.md, fill it in, then
     python scripts\handbook_sync.py push <file>; then python scripts\brain_equip.py
"@ -ForegroundColor Green
