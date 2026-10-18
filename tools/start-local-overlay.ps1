param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$launcher = Join-Path $PSScriptRoot 'local-overlay.js'
$executable = $env:TARTARUS_OVERLAY_EXE
if (!$executable) { $executable = Join-Path $env:LOCALAPPDATA 'Programs\tartarus-overlay\Tartarus Overlay.exe' }
$logDirectory = Join-Path $workspace 'desktop\dist'
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$env:ELECTRON_RUN_AS_NODE = '1'
# https://www.electronjs.org/docs/latest/api/environment-variables
$env:ELECTRON_NO_ATTACH_CONSOLE = '1'
$arguments = @(('"' + $launcher + '"'), '--background')
if ($CheckOnly) { $arguments += '--check' }
try {
  $process = Start-Process -FilePath $executable -ArgumentList $arguments -WorkingDirectory $workspace -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDirectory 'local-launch.log') -RedirectStandardError (Join-Path $logDirectory 'local-launch-error.log') -PassThru
  if ($CheckOnly) {
    # Retain the handle before waiting: Windows PowerShell can otherwise
    # report a null ExitCode after the short-lived child has exited.
    $process.Handle | Out-Null
    $process.WaitForExit()
    if ($process.ExitCode -ne 0) { throw 'Local overlay startup check failed. See desktop/dist/local-launch-error.log.' }
  }
} catch {
  if ($CheckOnly) { throw }
  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, 'Tartarus local overlay') | Out-Null
  exit 1
}
