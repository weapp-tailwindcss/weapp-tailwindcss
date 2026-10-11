import process from 'node:process'

/** 自动诊断仅记录当前测试身份；共享 IDE profile 和全局进程参数不属于测试资源。 */
export async function collectFrameworkIdeDiagnostics(caseName: string) {
  const context = { caseName, pid: process.pid, cwd: process.cwd(), observedAt: new Date().toISOString() }
  return `[e2e:ide] diagnostics for ${caseName}\n${JSON.stringify(context, null, 2)}`
}
