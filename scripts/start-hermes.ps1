param([string]$RuntimeRoot = (Join-Path (Split-Path $PSScriptRoot -Parent) 'runtime'))
$ErrorActionPreference = 'Stop'
$runtimePython = Join-Path $RuntimeRoot 'hermes-venv\Scripts\python.exe'
$env:HERMES_HOME = Join-Path $RuntimeRoot 'hermes-home'
$env:PYTHONIOENCODING = 'utf-8'
& $runtimePython (Join-Path $PSScriptRoot 'configure_hermes.py') --home $env:HERMES_HOME
if ($LASTEXITCODE -ne 0) { throw 'Hermes configuration failed.' }
Push-Location $env:HERMES_HOME
try { & (Join-Path $RuntimeRoot 'hermes-venv\Scripts\hermes.exe') gateway run } finally { Pop-Location }
