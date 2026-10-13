// 仅结束本次自建采集宿主；EOF 后不再把正常停止交给 PowerShell 的隐式宿主收尾。
export const windowsObserverShutdownScript = `
[Console]::Out.WriteLine('{"event":"observer-stopped","pid":' + [string]$PID + '}')
[Console]::Out.Flush()
[Environment]::Exit(0)
`
