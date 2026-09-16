param(
  [string]$Version = "37.10.3",
  [string]$Mirror = "https://npmmirror.com/mirrors/electron/"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$packageDir = Join-Path $root "node_modules/.pnpm/electron@$Version/node_modules/electron"
$binary = Join-Path $packageDir "dist/electron.exe"
if (Test-Path $binary) {
  Write-Host "Electron $Version binary already exists: $binary"
  exit 0
}

$zip = Join-Path $root "electron-v$Version-win32-x64.zip"
$url = "$($Mirror.TrimEnd('/'))/$Version/electron-v$Version-win32-x64.zip"
Write-Host "Downloading $url"
Invoke-WebRequest -Uri $url -OutFile $zip -TimeoutSec 600
New-Item -ItemType Directory -Force (Join-Path $packageDir "dist") | Out-Null
Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $packageDir "dist") -Force
Set-Content -Path (Join-Path $packageDir "path.txt") -Value "electron.exe" -NoNewline
if (-not (Test-Path $binary)) { throw "Electron extraction did not produce $binary" }
Write-Host "Electron binary ready: $binary"
