Set-ExecutionPolicy Bypass -Scope CurrentUser -Force
$ErrorActionPreference = 'Stop'
$dest = Join-Path $env:LOCALAPPDATA 'flyctl'
New-Item -ItemType Directory -Force -Path $dest | Out-Null

Write-Host 'Checking latest flyctl release ...'
$r = Invoke-Rest -Uri 'https://api.github.com/repos/superfly/flyctl/releases/latest'
$tag = $r.tag_name
$asset = $r.assets | Where-Object { $_.name -like '*Windows*x86_64.zip' } | Select-Object -First 1
if (-not $asset) {
  throw "No Windows x86_64 asset found in release $tag"
}
$zip = Join-Path $env:TEMP 'flyctl_latest.zip'
Write-Host "Downloading $($asset.name) ..."
Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $zip
Write-Host 'Extracting ...'
Expand-Archive -Path $zip -DestinationPath $dest -Force
$flyExe = Join-Path $dest 'flyctl.exe'
Write-Host 'Verifying ...'
& $flyExe version
