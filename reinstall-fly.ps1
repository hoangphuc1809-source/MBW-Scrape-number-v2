Set-ExecutionPolicy Bypass -Scope CurrentUser -Force
$ErrorActionPreference = 'Stop'
$dest = Join-Path $env:LOCALAPPDATA 'flyctl'
$zip = Join-Path $env:TEMP 'flyctl_0.4.72_Windows_x86_64.zip'
$url = 'https://github.com/superfly/flyctl/releases/download/v0.4.72/flyctl_0.4.72_Windows_x86_64.zip'
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Write-Host "Downloading flyctl v0.4.72 Windows x86_64 ..."
Invoke-WebRequest -Uri $url -OutFile $zip
Write-Host 'Extracting ...'
Expand-Archive -Path $zip -DestinationPath $dest -Force
$flyExe = Join-Path $dest 'flyctl.exe'
Write-Host 'Verifying ...'
& $flyExe version
