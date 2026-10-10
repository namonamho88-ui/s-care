param([string]$Destination = "$PSScriptRoot\..\runtime\jevos", [switch]$UseInstalledRuntime)
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Force -Path $root | Out-Null
$release = 'https://github.com/feder-cr/jev/releases/download/jevos-v4'
foreach ($name in @('jev-windows-x64.zip','jevos-v4-openvino-int8.zip','SHA256SUMS.txt')) {
    Invoke-WebRequest "$release/$name" -OutFile (Join-Path $root $name)
}
$checks = Get-Content -LiteralPath (Join-Path $root 'SHA256SUMS.txt')
foreach ($name in @('jev-windows-x64.zip','jevos-v4-openvino-int8.zip')) {
    $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $root $name)).Hash.ToLowerInvariant()
    if (-not ($checks | Where-Object { $_ -match ('^' + $hash + '\s+\*?' + [regex]::Escape($name) + '$') })) { throw "Checksum failed: $name" }
}
Expand-Archive -LiteralPath (Join-Path $root 'jev-windows-x64.zip') -DestinationPath $root -Force
Expand-Archive -LiteralPath (Join-Path $root 'jevos-v4-openvino-int8.zip') -DestinationPath (Join-Path $root 'jev') -Force
if ($UseInstalledRuntime) {
    $package = Get-AppxPackage 'Microsoft.VCLibs.140.00.UWPDesktop' | Where-Object Architecture -eq X64 | Sort-Object Version -Descending | Select-Object -First 1
    if (-not $package) { throw 'Installed x64 Microsoft VCLibs runtime not found. Install the current Microsoft Visual C++ Redistributable from Microsoft.' }
    foreach ($pattern in @('msvcp140*.dll','vcruntime140*.dll')) {
        Get-ChildItem -LiteralPath $package.InstallLocation -Filter $pattern | Copy-Item -Destination (Join-Path $root 'jev')
    }
    Write-Output "App-local Microsoft runtime copied from installed package $($package.Name) $($package.Version). System files were not modified."
}
Write-Output "Installed jevos-v4 under $root\jev. Start: .\jev.exe serve --threads 4"
