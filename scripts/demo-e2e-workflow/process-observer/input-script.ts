import type { ObserverInputStage } from './input'

/** 输入子阶段只使用 .NET 原生编码与输出，不依赖正在诊断的 JSON 模块。 */
export function windowsObserverInputProgress(stage: ObserverInputStage) {
  return String.raw`
$observerInputStage = '${stage}'
if ($observerInputTrace) {
  [Console]::Out.WriteLine('{"event":"request-input-progress","pid":' + [string]$PID + ',"line":"' + $observerInputLine + '","stage":"' + $observerInputStage + '"}')
  [Console]::Out.Flush()
}
`
}

/** 在 JSON cmdlet 和模块加载前证明本体已经读入原始请求；不解析或猜测请求 ID。 */
export const windowsObserverInputScript = String.raw`
$observerInputLine = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($line))
[Console]::Out.WriteLine('{"event":"request-line-received","pid":' + [string]$PID + ',"line":"' + $observerInputLine + '"}')
[Console]::Out.Flush()
${windowsObserverInputProgress('json-module-start')}
if (-not $observerJsonLoaded) {
  $observerJsonManifest = [System.IO.Path]::Combine($PSHOME, 'Modules', 'Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Utility.psd1')
  Import-Module -Name $observerJsonManifest -ErrorAction Stop
  $observerJsonLoaded = $true
}
${windowsObserverInputProgress('json-module-ready')}
${windowsObserverInputProgress('json-parse-start')}
$request = Microsoft.PowerShell.Utility\ConvertFrom-Json -InputObject $line
${windowsObserverInputProgress('json-parsed')}
`

/** 输入初始化失败不再调用同一个 JSON cmdlet；本次受管宿主失败退出。 */
export const windowsObserverInputFailureScript = String.raw`
$observerInputError = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($_.Exception.ToString()))
[Console]::Out.WriteLine('{"event":"request-input-failed","pid":' + [string]$PID + ',"line":"' + $observerInputLine + '","stage":"' + $observerInputStage + '","error":"' + $observerInputError + '"}')
[Console]::Out.Flush()
[Environment]::Exit(1)
`
