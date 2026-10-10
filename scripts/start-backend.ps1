param([string]$Java = 'java', [string]$EnvFile = '')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path $PSScriptRoot -Parent
$files = if ($EnvFile) { @($EnvFile) } else { @((Join-Path $repoRoot '.env'), (Join-Path $repoRoot '.env.local')) }
foreach ($file in $files) {
 if (Test-Path -LiteralPath $file) {
    foreach ($line in Get-Content -LiteralPath $file -Encoding UTF8) {
        if ($line -match '^\s*([A-Z][A-Z0-9_]*)=(.*)$') {
            $name = $Matches[1]
            $value = $Matches[2].Trim().Trim('"').Trim("'")
            # The backend never needs the upstream OpenAI key.
            if ($name -ne 'OPENAI_API_KEY') { [Environment]::SetEnvironmentVariable($name, $value, 'Process') }
        }
    }
 }
}
$jar = Join-Path $repoRoot 'backend\target\incident-brain-3.0.0.jar'
if (-not (Test-Path -LiteralPath $jar)) { throw 'Build first: backend\mvnw.cmd -f backend/pom.xml package' }
Push-Location $repoRoot
try { & $Java '-Xmx512m' '-jar' $jar; $result = $LASTEXITCODE } finally { Pop-Location }
exit $result
