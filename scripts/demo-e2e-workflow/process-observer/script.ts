import { Buffer } from 'node:buffer'
import { windowsProcessTreeMemoryFunction } from '../../demo-e2e-memory/windows'

// 身份与内存指标分开查询；每个请求重新查询，准备阶段结果不领取业务进程也不计入指标。
const script = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
${windowsProcessTreeMemoryFunction}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    $request = ConvertFrom-Json -InputObject $line
    if ($request.kind -eq 'identity') {
      $query = 'SELECT ProcessId, ParentProcessId, CreationDate FROM Win32_Process'
      if ($null -ne $request.pids) {
        $filters = @($request.pids | ForEach-Object { 'ProcessId = ' + [int]$_ })
        $query += ' WHERE ' + [string]::Join(' OR ', $filters)
      }
      $rows = @(Get-CimInstance -Query $query | Where-Object { $null -ne $_.CreationDate } | ForEach-Object {
        @{ pid = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; group = 0; started = $_.CreationDate.ToUniversalTime().ToString('o') }
      })
    } elseif ($request.kind -eq 'memory') {
      $rows = Get-WorkflowMemory -root ([int]$request.rootPid) -repositoryRoot ([string]$request.cwd)
    } else {
      throw "无法识别的身份采集操作：$($request.kind)"
    }
    $response = @{ id = [int]$request.id; rows = $rows }
  } catch {
    $response = @{ id = [int]$request.id; error = $_.Exception.Message }
  }
  [Console]::Out.WriteLine((ConvertTo-Json -InputObject $response -Depth 5 -Compress))
}
`

export const windowsObserverArgs = ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
