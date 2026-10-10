param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$runtimeRoot = Join-Path $repoRoot 'runtime'
$sourcePath = Join-Path $runtimeRoot 'hermes-agent'
$venvPath = Join-Path $runtimeRoot 'hermes-venv'
$revision = 'a7b2ba02e3b9bb95d0cac87a6312cc82a3bc3eed'
& $Python -c 'import sys; assert sys.version_info[:2] == (3,14), "Python 3.14 is required by the pinned Hermes version"'
if ($LASTEXITCODE -ne 0) { throw 'Python 3.14 is required.' }
New-Item -ItemType Directory -Force $runtimeRoot | Out-Null
if (-not (Test-Path -LiteralPath $sourcePath)) {
    git init $sourcePath
    git -C $sourcePath remote add origin https://github.com/NousResearch/hermes-agent.git
    git -C $sourcePath fetch --depth 1 origin $revision
    if ($LASTEXITCODE -ne 0) { throw 'Hermes fetch failed.' }
    git -C $sourcePath checkout --detach FETCH_HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Pinned revision checkout failed.' }
}
$actual = git -C $sourcePath rev-parse HEAD
if ($actual -ne $revision) { throw 'Existing Hermes source has a different revision; preserve it and choose a clean runtime directory.' }
& $Python -m venv $venvPath
if ($LASTEXITCODE -ne 0) { throw 'venv failed.' }
$runtimePython = Join-Path $venvPath 'Scripts\python.exe'
& $runtimePython -m pip install -e $sourcePath 'aiohttp==3.14.3'
if ($LASTEXITCODE -ne 0) { throw 'Hermes dependency installation failed.' }
& $runtimePython (Join-Path $PSScriptRoot 'patch_hermes_api.py') $sourcePath
if ($LASTEXITCODE -ne 0) { throw 'Pinned Hermes compatibility patch failed.' }
& $runtimePython (Join-Path $PSScriptRoot 'configure_hermes.py')
if ($LASTEXITCODE -ne 0) { throw 'Hermes configuration failed.' }
Write-Host 'Installed official Nous Hermes. Set OPENAI_API_KEY in the project .env, then run scripts/start-hermes.ps1.'
