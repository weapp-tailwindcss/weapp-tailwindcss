import { Buffer } from 'node:buffer'
import process from 'node:process'
import { windowsObserverShutdownScript } from '../../../../../scripts/demo-e2e-workflow/process-observer/shutdown-script'

// 单次 fixture 与持久会话复用同一采集函数，保留 Watch 自身的进程范围。
export const windowsWatchMemoryFunction = [
  'function Get-WatchMemory {',
  'param([int]$root, [string]$repositoryRoot)',
  '$watchCommandPatterns = @("weapp-vite(?:\\.js)?\\s+dev", "taro-build-guard\\.mjs\\s+--watch", "taro-build-runner\\.mjs\\s+build\\s+--type\\s+h5\\s+--watch", "taro-build-runner\\.mjs\\s+build\\s+--type\\s+\\S+\\s+--watch", "run-mpx-cli-service\\.js\\s+serve", "webpack(?:\\.js)?\\s+--watch", "gulp[\\s\\S]+gulpfile\\.ts", "\\bpnpm\\b[\\s\\S]+build:weapp[\\s\\S]+--watch", "hbuilderx[\\s\\S]+launch[\\s\\S]+mp-weixin", "uni\\.js[\\s\\S]+-p\\s+mp-weixin")',
  '$processes = @(Get-CimInstance Win32_Process -Property ProcessId,ParentProcessId,WorkingSetSize,CommandLine | Select-Object ProcessId,ParentProcessId,WorkingSetSize,CommandLine)',
  '$children = @{}',
  'foreach ($process in $processes) {',
  '  $parent = [int]$process.ParentProcessId',
  '  if (-not $children.ContainsKey($parent)) { $children[$parent] = @() }',
  '  $children[$parent] += $process',
  '}',
  '$tracked = @{}',
  '$stack = New-Object System.Collections.ArrayList',
  '$rootProcess = $processes | Where-Object { [int]$_.ProcessId -eq $root } | Select-Object -First 1',
  'if ($null -ne $rootProcess) { $tracked[[int]$rootProcess.ProcessId] = $rootProcess }',
  'if ($children.ContainsKey($root)) { foreach ($child in $children[$root]) { [void]$stack.Add($child) } }',
  'while ($stack.Count -gt 0) {',
  '  $current = $stack[$stack.Count - 1]',
  '  $stack.RemoveAt($stack.Count - 1)',
  '  $processId = [int]$current.ProcessId',
  '  if ($tracked.ContainsKey($processId)) { continue }',
  '  $tracked[$processId] = $current',
  '  if ($children.ContainsKey($processId)) { foreach ($child in $children[$processId]) { [void]$stack.Add($child) } }',
  '}',
  'foreach ($process in $processes) {',
  '  $command = if ($null -eq $process.CommandLine) { "" } else { [string]$process.CommandLine }',
  '  if ($command.Length -eq 0 -or -not $command.Contains($repositoryRoot)) { continue }',
  '  foreach ($pattern in $watchCommandPatterns) {',
  '    if ($command -match $pattern) { $tracked[[int]$process.ProcessId] = $process; break }',
  '  }',
  '}',
  '$total = 0',
  '$max = 0',
  'foreach ($process in $tracked.Values) {',
  '  $workingSet = if ($null -eq $process.WorkingSetSize) { 0 } else { [double]$process.WorkingSetSize }',
  '  $total += $workingSet',
  '  if ($workingSet -gt $max) { $max = $workingSet }',
  '}',
  '$top = @($tracked.Values | Sort-Object -Property WorkingSetSize -Descending | Select-Object -First 8 | ForEach-Object { $workingSet = if ($null -eq $_.WorkingSetSize) { 0 } else { [double]$_.WorkingSetSize }; $command = if ($null -eq $_.CommandLine) { "" } else { [string]$_.CommandLine }; @{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; rssMb = [int][Math]::Round($workingSet / 1MB); command = $command.Substring(0, [Math]::Min(240, $command.Length)) } })',
  'return @{ rssMb = [int][Math]::Round($total / 1MB); maxProcessRssMb = [int][Math]::Round($max / 1MB); processCount = [int]$tracked.Count; topProcesses = $top }',
  '}',
].join('\n')

export function createWindowsProcessTreeMemoryScript(rootPid: number, cwd = process.cwd()) {
  return [
    '$ErrorActionPreference = "Stop"',
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    windowsWatchMemoryFunction,
    `Get-WatchMemory -root ${JSON.stringify(rootPid)} -repositoryRoot '${cwd.replaceAll('\'', '\'\'')}' | ConvertTo-Json -Compress -Depth 4`,
  ].join('\n')
}

const observerScript = `
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
[Console]::Out.WriteLine('{"event":"observer-ready","pid":' + [string]$PID + ',"version":"' + $PSVersionTable.PSVersion.ToString() + '"}')
[Console]::Out.Flush()
${windowsWatchMemoryFunction}
while ($null -ne ($line = [Console]::In.ReadLine())) {
  try {
  $request = ConvertFrom-Json -InputObject $line
  if ($request.kind -ne 'memory') { throw 'Watch memory source accepts memory requests only' }
  [Console]::Out.WriteLine('{"event":"request-received","kind":"memory","id":' + [string][int]$request.id + '}')
  [Console]::Out.Flush()
  $rows = Get-WatchMemory -root ([int]$request.rootPid) -repositoryRoot ([string]$request.cwd)
  [Console]::Out.WriteLine('{"event":"query-completed","kind":"memory","id":' + [string][int]$request.id + '}')
  [Console]::Out.Flush()
  $response = @{ id = [int]$request.id; rows = $rows }
  } catch {
  $response = @{ id = [int]$request.id; error = $_.Exception.Message }
  }
  $json = ConvertTo-Json -InputObject $response -Depth 5 -Compress
  if ($null -eq $response.error) {
  [Console]::Out.WriteLine('{"event":"response-ready","kind":"memory","id":' + [string][int]$request.id + '}')
  [Console]::Out.Flush()
  }
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
}
${windowsObserverShutdownScript}
`

export const windowsWatchMemoryArgs = ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(observerScript, 'utf16le').toString('base64')]
