Set-ExecutionPolicy Bypass -Scope CurrentUser -Force
$ErrorActionPreference = 'Stop'
$zip = Join-Path $env:TEMP 'flyctl.zip'
$dest = Join-Path $env:LOCALAPPDATA 'flyctl'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host 'Downloading flyctl ...'
Invoke-WebRequest -Uri 'https://github.com/superfly/flyctl/releases/latest/download/flyctl_0.0.831_Windows_x86_64.zip' -OutFile $zip

Write-Host 'Extracting ...'
Expand-Archive -Path $zip -DestinationPath $dest -Force

$newPath = $env:PATH + ';' + $dest
$env:PATH = $newPath
[Environment]::SetEnvironmentVariable('Path', $newPath, [EnvironmentVariableTarget]::User)

Write-Host 'Verifying ...'
& (Join-Path $dest 'flyctl.exe') version
