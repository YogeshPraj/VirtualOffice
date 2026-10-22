# Dot-source this before any npm, npx or bun call the office makes.
#
# The office's packages all come from the public npm registry. On a work machine, your own npm
# settings (a user .npmrc) often point npm at a company registry that needs a login, and npm
# then fails with "E401 Incorrect or missing password". This keeps those settings out of the
# office's installs, without changing them for anything else.
#
# If your network blocks the public registry, set VIRTUAL_OFFICE_NPM_REGISTRY to your company's
# npm mirror (for example an Azure Artifacts feed URL); the office then uses that registry and
# your own npm login (run your company's npm sign-in first).

$officeTools = Join-Path (Split-Path $PSScriptRoot -Parent) ".tools"
if ($env:VIRTUAL_OFFICE_NPM_REGISTRY) {
    $env:NPM_CONFIG_REGISTRY = $env:VIRTUAL_OFFICE_NPM_REGISTRY
    $env:BUN_CONFIG_REGISTRY = $env:VIRTUAL_OFFICE_NPM_REGISTRY
} else {
    if (-not (Test-Path $officeTools)) { New-Item -ItemType Directory -Force -Path $officeTools | Out-Null }
    $officeNpmrc = Join-Path $officeTools "office.npmrc"
    if (-not (Test-Path $officeNpmrc)) { Set-Content -Path $officeNpmrc -Value "registry=https://registry.npmjs.org/" -Encoding ascii }
    $env:NPM_CONFIG_USERCONFIG = $officeNpmrc
    $env:NPM_CONFIG_REGISTRY = "https://registry.npmjs.org/"
    $env:BUN_CONFIG_REGISTRY = "https://registry.npmjs.org/"
}
