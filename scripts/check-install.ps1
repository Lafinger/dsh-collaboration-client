param(
  [Parameter(Mandatory = $true)][string]$Cli,
  [string]$Package = (Split-Path -Parent $PSScriptRoot),
  [string]$Profile = ('collaboration-compat-' + [guid]::NewGuid().ToString('N').Substring(0, 12))
)
$ErrorActionPreference = 'Stop'
if ($Profile -notmatch '^collaboration-compat-[a-zA-Z0-9-]+$') {
  throw 'Use a dedicated collaboration-compat-* profile; existing desktop/acp profiles are forbidden.'
}
$resolvedPackage = (Resolve-Path -LiteralPath $Package).Path
$output = & $Cli plugin --profile $Profile add $resolvedPackage --ignore-scripts 2>&1
$code = $LASTEXITCODE
$output | Write-Output
if (($output -join "`n") -match 'incompatible with dsh') {
  throw 'Installation compatibility rejected: update verified peers; do not grant an exemption.'
}
if ($code -ne 0) { throw "Installation failed ($code)" }
Write-Output "PASS: actual DSH installer accepted package in isolated profile $Profile"
# This verifies installer acceptance/bundle registration, not configured SSH or GUI rendering.
