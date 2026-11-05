$ErrorActionPreference = 'Stop'
try {
  Add-Type -Path (Join-Path $PSScriptRoot 'supervisor.cs')
  $result = [Weapp.CI.OwnedProcess]::Run($env:WEAPP_WINDOWS_OWNED_NODE, $env:WEAPP_WINDOWS_OWNED_WORKER)
  exit $result
}
catch {
  [Console]::Error.WriteLine($_.Exception.ToString())
  exit 1
}
