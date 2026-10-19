/** 在 JSON cmdlet 和模块加载前证明本体已经读入原始请求；不解析或猜测请求 ID。 */
export const windowsObserverInputScript = String.raw`
[Console]::Out.WriteLine('{"event":"request-line-received","pid":' + [string]$PID + ',"line":"' + [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($line)) + '"}')
[Console]::Out.Flush()
if (-not $observerJsonLoaded) {
  $observerJsonManifest = [System.IO.Path]::Combine($PSHOME, 'Modules', 'Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Utility.psd1')
  Import-Module -Name $observerJsonManifest -ErrorAction Stop
  $observerJsonLoaded = $true
}
`
