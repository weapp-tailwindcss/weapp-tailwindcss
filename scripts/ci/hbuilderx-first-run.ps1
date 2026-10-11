param(
  [Parameter(Mandatory = $true)][string]$Executable,
  [Parameter(Mandatory = $true)][string]$ArtifactRoot
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
if ($env:GITHUB_ACTIONS -ne 'true') { throw '首次引导仅允许在独立 GitHub runner 操作' }
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path $ArtifactRoot | Out-Null

function Get-IdeElements {
  $processes = @([System.Diagnostics.Process]::GetProcessesByName('HBuilderX') | Where-Object {
    $_.MainModule.FileName -eq $Executable
  })
  if ($processes.Count -ne 1) { throw "安装目录对应的 IDE 进程数量异常：$($processes.Count)" }
  $condition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ProcessIdProperty, $processes[0].Id)
  $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
    [System.Windows.Automation.TreeScope]::Children, $condition)
  foreach ($window in $windows) {
    $window
    foreach ($element in $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,
      [System.Windows.Automation.Condition]::TrueCondition)) { $element }
  }
}

function Save-IdeState([string]$Name, $Elements) {
  @($Elements | ForEach-Object {
    [pscustomobject]@{
      name = $_.Current.Name
      controlType = $_.Current.ControlType.ProgrammaticName
      automationId = $_.Current.AutomationId
      className = $_.Current.ClassName
      enabled = $_.Current.IsEnabled
      offscreen = $_.Current.IsOffscreen
      rectangle = $_.Current.BoundingRectangle.ToString()
    }
  }) | ConvertTo-Json -Depth 4 | Set-Content -Encoding utf8 (Join-Path $ArtifactRoot "$Name.json")
  $bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
    $bitmap.Save((Join-Path $ArtifactRoot "$Name.png"))
  } finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function Get-StartButtons($Elements) {
  # 名称来自官方语言包 dialog.button.startuse，不操作其他对话框。
  @($Elements | Where-Object {
    $_.Current.ControlType -eq [System.Windows.Automation.ControlType]::Button -and
    $_.Current.Name.Replace('&', '').Trim() -in @('Enjoy It', 'Enjoy It Alt+E', 'Enjoy It Enter', '开始体验') -and
    $_.Current.IsEnabled -and -not $_.Current.IsOffscreen
  })
}

$deadline = [DateTime]::UtcNow.AddSeconds(30)
do {
  $elements = @(Get-IdeElements)
  if ($elements.Count -gt 0) { break }
  Start-Sleep -Milliseconds 500
} while ([DateTime]::UtcNow -lt $deadline)
if ($elements.Count -eq 0) { throw 'IDE 未暴露窗口，无法确认首次界面' }
Save-IdeState 'before' $elements
$buttons = @(Get-StartButtons $elements)
if ($buttons.Count -gt 1) { throw '首次引导按钮不唯一，拒绝猜测操作目标' }
$themeVisible = @($elements | Where-Object { $_.Current.Name -eq 'Select your favorite theme' }).Count -gt 0
if ($themeVisible -and $buttons.Count -eq 0) { throw '首次主题向导仍显示，但没有识别到完成按钮' }
$invoked = $false
if ($buttons.Count -eq 1) {
  $pattern = $null
  if ($buttons[0].TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$pattern)) {
    $pattern.Invoke()
  } elseif ($buttons[0].TryGetCurrentPattern([System.Windows.Automation.LegacyIAccessiblePattern]::Pattern, [ref]$pattern)) {
    $pattern.DoDefaultAction()
  } else { throw '首次引导按钮不支持语义调用' }
  $invoked = $true
  do {
    Start-Sleep -Milliseconds 500
    $elements = @(Get-IdeElements)
    $remaining = @($elements | Where-Object { $_.Current.Name -eq 'Select your favorite theme' }) + @(Get-StartButtons $elements)
  } while ($remaining.Count -gt 0 -and [DateTime]::UtcNow -lt $deadline)
  if ($remaining.Count -gt 0) { throw '首次引导调用后仍未关闭' }
}
Save-IdeState 'after' $elements
$result = @{ invoked = $invoked; elementCount = $elements.Count; executable = $Executable } | ConvertTo-Json
$result | Set-Content -Encoding utf8 (Join-Path $ArtifactRoot 'result.json')
Write-Output $result
