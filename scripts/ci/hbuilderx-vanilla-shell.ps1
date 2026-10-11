$ErrorActionPreference = 'Stop'
# 与交互式 PowerShell 一致调用官方 CLI；JSON 传参避免脚本文本插值。
$PSNativeCommandArgumentPassing = 'Standard'
$invocation = ConvertFrom-Json $env:E2E_HBUILDERX_VANILLA_INVOCATION
$cliArguments = [string[]]$invocation.args
& ([string]$invocation.executable) @cliArguments
exit $LASTEXITCODE
