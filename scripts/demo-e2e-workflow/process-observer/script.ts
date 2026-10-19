import { Buffer } from 'node:buffer'
import { windowsProcessTreeMemoryFunction } from '../../demo-e2e-memory/windows'
import { windowsObserverInputScript } from './input-script'
import { windowsObserverShutdownScript } from './shutdown-script'

// 身份与内存指标分开查询；每个请求重新查询，准备阶段结果不领取业务进程也不计入指标。
const script = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::Out.WriteLine('{"event":"observer-ready","pid":' + [int]$PID + ',"version":"' + $PSVersionTable.PSVersion.ToString() + '"}')
[Console]::Out.Flush()
${windowsProcessTreeMemoryFunction}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
    ${windowsObserverInputScript}
    $request = Microsoft.PowerShell.Utility\\ConvertFrom-Json -InputObject $line
    [Console]::Out.WriteLine((Microsoft.PowerShell.Utility\\ConvertTo-Json -InputObject @{ event = 'request-received'; id = [int]$request.id; kind = [string]$request.kind } -Compress))
    [Console]::Out.Flush()
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
    [Console]::Out.WriteLine((Microsoft.PowerShell.Utility\\ConvertTo-Json -InputObject @{ event = 'query-completed'; id = [int]$request.id; kind = [string]$request.kind } -Compress))
    [Console]::Out.Flush()
    $response = @{ id = [int]$request.id; rows = $rows }
  } catch {
    $response = @{ id = [int]$request.id; error = $_.Exception.Message }
  }
  $json = Microsoft.PowerShell.Utility\\ConvertTo-Json -InputObject $response -Depth 5 -Compress
  if ($null -eq $response.error) {
    [Console]::Out.WriteLine((Microsoft.PowerShell.Utility\\ConvertTo-Json -InputObject @{ event = 'response-ready'; id = [int]$request.id; kind = [string]$request.kind } -Compress))
    [Console]::Out.Flush()
  }
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}
${windowsObserverShutdownScript}
`

export const windowsObserverArgs = ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')]
