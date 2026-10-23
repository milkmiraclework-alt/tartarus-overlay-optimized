param([switch]$SkipInstall, [switch]$UnpackedOnly)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
$nodeExe = if ($nodeCommand) { $nodeCommand.Source } else { Join-Path $workspace 'sandbox\runtime\node.exe' }
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
$npmExe = if ($npmCommand) { $npmCommand.Source } else { Join-Path $workspace 'sandbox\runtime\npm.cmd' }
if (!(Test-Path -LiteralPath $nodeExe) -or !(Test-Path -LiteralPath $npmExe)) { throw 'Install Node.js 22.12+ with npm to build the standalone overlay.' }
$env:PATH = (Split-Path -Parent $nodeExe) + ';' + (Split-Path -Parent $npmExe) + ';' + $env:PATH
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
Push-Location -LiteralPath (Join-Path $workspace 'desktop')
try {
  if (!$SkipInstall) {
    & $npmExe ci --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
  }
  & $nodeExe (Join-Path $PSScriptRoot 'stage-overlay.js')
  if ($LASTEXITCODE -ne 0) { throw 'Asset staging failed.' }
  $buildArgs = @('--win', '--x64', '--publish=never')
  if ($UnpackedOnly) { $buildArgs += '--dir' }
  & $nodeExe (Join-Path $workspace 'desktop\node_modules\electron-builder\cli.js') @buildArgs
  if ($LASTEXITCODE -ne 0) { throw 'Standalone packaging failed.' }
  $manifestArgs = @()
  if ($UnpackedOnly) { $manifestArgs += '--unpacked-only' }
  & $nodeExe (Join-Path $PSScriptRoot 'standalone-manifest.js') @manifestArgs
  if ($LASTEXITCODE -ne 0) { throw 'Standalone verification failed.' }
} finally { Pop-Location }
