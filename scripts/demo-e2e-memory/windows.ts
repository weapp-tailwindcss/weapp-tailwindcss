import type { DemoE2eMemorySample } from '../demo-e2e-memory'
import process from 'node:process'

const query = '$processes = @(Get-CimInstance -Query "SELECT ProcessId, ParentProcessId, WorkingSetSize, CommandLine FROM Win32_Process")'
const statements = [
  '$watchCommandPatterns = @("weapp-vite(?:\\.js)?\\s+dev", "taro-build-guard\\.mjs\\s+--watch", "taro-build-runner\\.mjs\\s+build\\s+--type\\s+h5\\s+--watch", "run-mpx-cli-service\\.js\\s+serve", "webpack(?:\\.js)?\\s+--watch", "gulp[\\s\\S]+gulpfile\\.ts", "\\bpnpm\\b[\\s\\S]+build:weapp[\\s\\S]+--watch", "hbuilderx[\\s\\S]+launch[\\s\\S]+mp-weixin", "uni\\.js[\\s\\S]+-p\\s+mp-weixin")',
  '$children = @{}',
  'foreach ($process in $processes) { $parent = [int]$process.ParentProcessId; if (-not $children.ContainsKey($parent)) { $children[$parent] = @() }; $children[$parent] += $process }',
  '$tracked = @{}',
  '$stack = New-Object System.Collections.ArrayList',
  '$rootProcess = $processes | Where-Object { [int]$_.ProcessId -eq $root } | Select-Object -First 1',
  'if ($null -ne $rootProcess) { $tracked[[int]$rootProcess.ProcessId] = $rootProcess }',
  'if ($children.ContainsKey($root)) { foreach ($child in $children[$root]) { [void]$stack.Add($child) } }',
  'while ($stack.Count -gt 0) { $current = $stack[$stack.Count - 1]; $stack.RemoveAt($stack.Count - 1); $processPid = [int]$current.ProcessId; if ($tracked.ContainsKey($processPid)) { continue }; $tracked[$processPid] = $current; if ($children.ContainsKey($processPid)) { foreach ($child in $children[$processPid]) { [void]$stack.Add($child) } } }',
  'foreach ($process in $processes) {',
  '  $command = if ($null -eq $process.CommandLine) { "" } else { [string]$process.CommandLine }',
  '  if ($command.Length -eq 0 -or -not $command.Contains($repositoryRoot)) { continue }',
  '  foreach ($pattern in $watchCommandPatterns) {',
  '    if ($command -match $pattern) { $tracked[[int]$process.ProcessId] = $process; break }',
  '  }',
  '}',
  '$total = 0; $max = 0',
  'foreach ($process in $tracked.Values) { $workingSet = if ($null -eq $process.WorkingSetSize) { 0 } else { [double]$process.WorkingSetSize }; $total += $workingSet; if ($workingSet -gt $max) { $max = $workingSet } }',
  '$top = @($tracked.Values | Sort-Object -Property WorkingSetSize -Descending | Select-Object -First 8 | ForEach-Object { $workingSet = if ($null -eq $_.WorkingSetSize) { 0 } else { [double]$_.WorkingSetSize }; $command = if ($null -eq $_.CommandLine) { "" } else { [string]$_.CommandLine }; @{ pid = [int]$_.ProcessId; ppid = [int]$_.ParentProcessId; rssMb = [int][Math]::Round($workingSet / 1MB); command = $command.Substring(0, [Math]::Min(240, $command.Length)) } })',
]
const result = '@{ rssMb = [int][Math]::Round($total / 1MB); maxProcessRssMb = [int][Math]::Round($max / 1MB); processCount = [int]$tracked.Count; topProcesses = $top }'

/** 同一测量函数供独立探针和受管会话使用；仅启动准备传入本次快照，其余调用逐次新查。命令匹配不授予清理归属。 */
export const windowsProcessTreeMemoryFunction = `function Get-WorkflowMemory {\nparam([int]$root, [string]$repositoryRoot, [object[]]$processes)\nif ($null -eq $processes) { ${query} }\n${statements.join('\n')}\nreturn ${result}\n}`

export function createWindowsProcessTreeMemoryScript(rootPid: number, cwd = process.cwd()) {
  return [
    '$ErrorActionPreference = \'Stop\'',
    '[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)',
    `$root = [int]${JSON.stringify(rootPid)}`,
    `$repositoryRoot = '${cwd.replaceAll('\'', '\'\'')}'`,
    query,
    ...statements,
    `[Console]::Out.WriteLine((${result} | ConvertTo-Json -Compress -Depth 4))`,
  ].join('; ')
}

/** 校验内存结果后才计入报告，坏数据不能伪装成没有样本。 */
export function parseWindowsMemorySample(value: unknown): DemoE2eMemorySample {
  const sample = value as Partial<DemoE2eMemorySample> | undefined
  const metric = (number: unknown) => typeof number === 'number' && Number.isFinite(number) && number >= 0
  if (!sample || !metric(sample.rssMb) || !metric(sample.maxProcessRssMb) || !Number.isInteger(sample.processCount) || sample.processCount! < 0
    || (sample.topProcesses !== undefined && (!Array.isArray(sample.topProcesses) || sample.topProcesses.some(row => !row || !Number.isInteger(row.pid) || !Number.isInteger(row.ppid) || !metric(row.rssMb) || (row.command !== undefined && typeof row.command !== 'string'))))) {
    throw new TypeError('Windows 内存探针响应无效。')
  }
  return { ...sample, at: Date.now() } as DemoE2eMemorySample
}
