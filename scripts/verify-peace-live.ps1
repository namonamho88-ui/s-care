param([switch]$Regression,[switch]$WarRoom,[switch]$PeaceOnly,[string]$Grep)
$ErrorActionPreference = 'Stop'
$wrRoot = Split-Path -Parent $PSScriptRoot
$wrJar = Join-Path $wrRoot 'backend/target/incident-brain-3.0.0.jar'
if (-not (Test-Path -LiteralPath $wrJar)) { throw 'Run backend mvnw package first.' }
if (Get-NetTCPConnection -LocalPort 8087,3100 -State Listen -ErrorAction SilentlyContinue) { throw 'Ports 8087 and 3100 must be free for isolated verification.' }
$wrNames = @('ADMIN_TOKEN','WAR_ROOM_ENABLED','WAR_ROOM_GATEWAY_KEY','WAR_ROOM_ALLOWED_ORIGINS','WAR_ROOM_WS_URL','WAR_ROOM_LIVE','WAR_ROOM_TEST_ADMIN','BACKEND_URL','GRAPH_REQUIRED','NEO4J_URI','HERMES_PUBLISH_MODE','DB_URL','DB_USER','DB_PASSWORD','SPRING_PROFILES_ACTIVE','COOKIE_SECURE','VERCEL')
$wrPrevious = @{}
foreach ($wrName in $wrNames) { $wrPrevious[$wrName] = [Environment]::GetEnvironmentVariable($wrName,'Process') }
$wrProcess = $null
try {
 $env:ADMIN_TOKEN = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
 $env:WAR_ROOM_TEST_ADMIN = $env:ADMIN_TOKEN
 $env:WAR_ROOM_ENABLED = 'true'
 $env:WAR_ROOM_GATEWAY_KEY = [Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
 $env:WAR_ROOM_ALLOWED_ORIGINS = 'http://127.0.0.1:3100'
 $env:WAR_ROOM_WS_URL = 'ws://127.0.0.1:8087/api/war-room/socket'
 $env:WAR_ROOM_LIVE = 'true'
 $env:BACKEND_URL = 'http://127.0.0.1:8087'
 $env:GRAPH_REQUIRED = 'false'
 $env:NEO4J_URI = 'disabled'
 $env:HERMES_PUBLISH_MODE = 'disabled'
 $env:DB_URL = 'jdbc:h2:mem:war_room_browser;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1'
 $env:DB_USER = 'sa'
 $env:DB_PASSWORD = ''
 $env:SPRING_PROFILES_ACTIVE = ''
 $env:COOKIE_SECURE = 'false'
 $env:VERCEL = ''
 $wrProcess = Start-Process -FilePath (Get-Command java).Source -ArgumentList @('-jar',('"'+$wrJar+'"'),'--server.address=127.0.0.1','--server.port=8087','--brain.neo4j-uri=disabled','--brain.internal-url=http://127.0.0.1:8087') -WindowStyle Hidden -PassThru -WorkingDirectory (Join-Path $wrRoot 'backend') -RedirectStandardOutput (Join-Path $wrRoot 'backend/war-room-live-server.log') -RedirectStandardError (Join-Path $wrRoot 'backend/war-room-live-server-error.log')
 $wrReady = $false
 for ($wrAttempt=0;$wrAttempt -lt 40;$wrAttempt++) {
  if ($wrProcess.HasExited) { throw 'Isolated backend stopped. Inspect war-room-live-server logs.' }
  try { $wrHealth = Invoke-RestMethod 'http://127.0.0.1:8087/api/health' -TimeoutSec 2; if ($wrHealth.status -eq 'UP') { $wrReady=$true; break } } catch { Start-Sleep -Milliseconds 500 }
 }
 if (-not $wrReady) { throw 'Isolated backend did not become ready.' }
 Push-Location (Join-Path $wrRoot 'frontend')
 try {
  $citySpecs = @('peace-live.spec.ts')
  if (-not $PeaceOnly) { $citySpecs += @('city-live.spec.ts') }
  if ($Regression -or $WarRoom) { $citySpecs += @('war-room.spec.ts','war-room-workflow.spec.ts','war-room-camera.spec.ts') }
  if ($Regression) { $citySpecs += @('twin-lab.spec.ts','usability.spec.ts') }
  if ($Grep) { $citySpecs += @('--grep',$Grep) }
  & npm.cmd run test:ui -- @citySpecs
  if ($LASTEXITCODE -ne 0) { throw 'Live browser verification failed.' }
 } finally { Pop-Location }
} finally {
 # Oracle's javapath launcher can spawn a separate JVM; stop only our jar's child.
 if ($wrProcess) { Get-CimInstance Win32_Process -Filter "ParentProcessId = $($wrProcess.Id)" | Where-Object { $_.CommandLine -and $_.CommandLine.Contains($wrJar) } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue } }
 if ($wrProcess -and -not $wrProcess.HasExited) { Stop-Process -Id $wrProcess.Id }
 foreach ($wrName in $wrNames) { [Environment]::SetEnvironmentVariable($wrName,$wrPrevious[$wrName],'Process') }
}
