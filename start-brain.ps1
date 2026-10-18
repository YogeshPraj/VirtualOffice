# Starts the company's second brain (GBrain) as ONE shared local server on 127.0.0.1:3131.
# Every employee (and the CEO's office) connects to this server over HTTP MCP with a token
# from .brain\. A single owner process is required: the local PGLite database can only be
# opened by one process at a time.
$root = $PSScriptRoot
$env:PATH = "$root\.tools\bun;$env:PATH"
$cli = "$HOME\.bun\install\global\node_modules\gbrain\src\cli.ts"
bun $cli serve --http --port 3131 --bind 127.0.0.1 --surface full
