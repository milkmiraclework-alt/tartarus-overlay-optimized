param(
  [string]$Branch = 'optimized-overlay',
  [string]$ForkName = 'tartarus-overlay-optimized',
  [switch]$CheckOnly
)
$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $workspace
$upstream = 'blahdot3h/tartarus-simulator'
$cli = Get-Command gh -ErrorAction SilentlyContinue
$githubCli = if ($cli) { $cli.Source } else { Join-Path $workspace 'sandbox\github-cli\gh.exe' }
if (!(Test-Path -LiteralPath $githubCli)) { throw 'Install GitHub CLI, then run gh auth login.' }
if ($ForkName -notmatch '^[A-Za-z0-9_.-]+$') { throw 'Invalid fork repository name.' }
& git check-ref-format --branch $Branch | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Invalid branch name.' }
& git show-ref --verify --quiet "refs/heads/$Branch"
if ($LASTEXITCODE -ne 0) { throw "Prepared branch '$Branch' was not found." }
$commit = & git rev-parse "refs/heads/$Branch"
if ($LASTEXITCODE -ne 0) { throw 'Cannot read the prepared commit.' }
if ($CheckOnly) {
  Write-Output "Ready: $Branch at $commit. Publication requires GitHub login."
  exit 0
}
& $githubCli auth status --hostname github.com
if ($LASTEXITCODE -ne 0) {
  & $githubCli auth login --hostname github.com --git-protocol https --web
  if ($LASTEXITCODE -ne 0) { throw 'GitHub sign-in did not complete; nothing was published.' }
}
$login = & $githubCli api user --jq .login
if ($LASTEXITCODE -ne 0 -or !$login) { throw 'Cannot determine the signed-in GitHub account.' }
$repository = "$login/$ForkName"
# Windows PowerShell can turn a native tool's stderr into a terminating error.
try { $parent = & $githubCli api "repos/$repository" --jq .parent.full_name 2>$null }
catch { $parent = $null }
if ($LASTEXITCODE -ne 0) {
  & $githubCli repo fork $upstream --fork-name $ForkName --clone=false --remote=false
  if ($LASTEXITCODE -ne 0) { throw 'Could not create the fork.' }
  $parent = & $githubCli api "repos/$repository" --jq .parent.full_name
  if ($LASTEXITCODE -ne 0) { throw 'Could not verify the new fork.' }
}
if ($parent -ne $upstream) { throw "'$repository' is not a fork of '$upstream'; refusing to push." }
$target = "https://github.com/$repository.git"
Write-Output "Publishing $Branch ($commit) to $repository..."
# Use gh credentials for this command only; leave global Git configuration
# and the author's origin remote unchanged. A normal push never force-writes.
$quotedCli = "'" + ($githubCli.Replace('\', '/').Replace("'", "'\''")) + "'"
& git -c credential.helper= -c "credential.helper=!$quotedCli auth git-credential" push $target "refs/heads/${Branch}:refs/heads/$Branch"
if ($LASTEXITCODE -ne 0) { throw 'Push failed. No force push was attempted.' }
& $githubCli repo edit $repository --default-branch $Branch --description 'Local Tartarus overlay: faster recognition and full-budget Monte Carlo, persistent cache and rolling forecasts.'
if ($LASTEXITCODE -ne 0) { throw 'Source was pushed, but setting the default branch failed.' }
$published = & $githubCli api "repos/$repository/commits/$Branch" --jq .sha
if ($LASTEXITCODE -ne 0 -or $published -ne $commit) { throw 'Published commit could not be verified.' }
Write-Output "Published and verified: https://github.com/$repository"
