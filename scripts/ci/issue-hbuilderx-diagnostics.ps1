$ErrorActionPreference = 'Continue'
$artifactRoot = $env:E2E_HBUILDERX_DIAGNOSTIC_DIR
New-Item -ItemType Directory -Force -Path $artifactRoot | Out-Null
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -match 'HBuilder|node|cli|chrome|cmd|conhost|Runner|powershell|pwsh' } |
  Select-Object Name, ProcessId, ParentProcessId, SessionId, ExecutablePath, CommandLine |
  ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $artifactRoot 'processes.json')
Get-NetTCPConnection -State Listen |
  Select-Object LocalAddress, LocalPort, OwningProcess |
  ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $artifactRoot 'ports.json')
Get-Process | Where-Object { $_.MainWindowTitle } |
  Select-Object Id, ProcessName, SessionId, MainWindowTitle |
  ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $artifactRoot 'windows.json')

# 用户名相同不代表处于同一交互会话；线程等待原因只作为现场数据，不据此认定死锁。
$currentProcess = [System.Diagnostics.Process]::GetCurrentProcess()
[ordered]@{
  ProcessId = $currentProcess.Id
  SessionId = $currentProcess.SessionId
  UserInteractive = [Environment]::UserInteractive
  SessionName = $env:SESSIONNAME
  Identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $artifactRoot 'session.json')
$nativeThreads = foreach ($nativeProcess in (Get-Process -Name HBuilderX, cli -ErrorAction SilentlyContinue)) {
  foreach ($nativeThread in $nativeProcess.Threads) {
    try {
      $state = $nativeThread.ThreadState
      [ordered]@{
        ProcessId = $nativeProcess.Id
        SessionId = $nativeProcess.SessionId
        ThreadId = $nativeThread.Id
        State = [string]$state
        WaitReason = if ($state -eq [System.Diagnostics.ThreadState]::Wait) { [string]$nativeThread.WaitReason } else { $null }
      }
    } catch {
      [ordered]@{ ProcessId = $nativeProcess.Id; ThreadId = $nativeThread.Id; Error = $_.Exception.Message }
    }
  }
}
@($nativeThreads) | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $artifactRoot 'native-threads.json')

# 仅在独立的 GitHub Windows runner 中采集当前 IDE 桌面。
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
$bitmap.Save((Join-Path $artifactRoot 'desktop.png'))
$graphics.Dispose()
$bitmap.Dispose()

$roots = @((Split-Path $env:HBUILDERX_CLI_PATH), $env:APPDATA, $env:LOCALAPPDATA)
$inventory = @()
foreach ($root in $roots) {
  $directories = if ($root -eq (Split-Path $env:HBUILDERX_CLI_PATH)) { @($root) } else {
    Get-ChildItem $root -Directory -Filter '*HBuilder*' | Select-Object -ExpandProperty FullName
  }
  foreach ($directory in $directories) {
    $logs = Get-ChildItem $directory -Recurse -File -Filter '*.log' -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -notmatch '[\\/]node_modules[\\/]' }
    foreach ($log in $logs) {
      $inventory += $log.FullName
      $target = Join-Path $artifactRoot ("native-" + $inventory.Count + '.log')
      Get-Content $log.FullName -Tail 500 | Set-Content -Encoding utf8 $target
    }
  }
}
$inventory | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $artifactRoot 'native-log-paths.json')

# 原现场采集完毕后再发只读请求，不重试原始失败操作。
node (Join-Path $PSScriptRoot 'hbuilderx-cli-health.mjs')
