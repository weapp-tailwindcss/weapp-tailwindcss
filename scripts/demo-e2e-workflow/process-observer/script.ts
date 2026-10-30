import { Buffer } from 'node:buffer'
import { windowsProcessTreeMemoryFunction } from '../../demo-e2e-memory/windows'
import { windowsObserverInputScript } from './input-script'
import { windowsObserverShutdownScript } from './shutdown-script'

// 准备共用一次本体快照；运行身份与内存每个请求重新查询，准备结果不领取业务归属或计入指标。
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
    if ($request.kind -eq 'prepare') {
      if ([int]$request.rootPid -ne [int]$PID) { throw '准备请求必须绑定采集器本体。' }
      $snapshot = @(Get-CimInstance -Query ('SELECT ProcessId, ParentProcessId, CreationDate, WorkingSetSize, CommandLine FROM Win32_Process WHERE ProcessId = ' + [int]$PID))
      if ($snapshot.Count -ne 1 -or [int]$snapshot[0].ProcessId -ne [int]$PID -or $null -eq $snapshot[0].CreationDate -or $null -eq $snapshot[0].WorkingSetSize) { throw '准备查询缺少完整的唯一本体快照。' }
      $identities = @($snapshot | Where-Object { $null -ne $_.CreationDate } | ForEach-Object {
        @{ pid = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; group = 0; started = $_.CreationDate.ToUniversalTime().ToString('o') }
      })
      $rows = @{ identities = $identities; memory = (Get-WorkflowMemory -root ([int]$PID) -repositoryRoot ([string]$request.cwd) -processes $snapshot) }
      $snapshot = $null
    } elseif ($request.kind -eq 'identity') {
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
