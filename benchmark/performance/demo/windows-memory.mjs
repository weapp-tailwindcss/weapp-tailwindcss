import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'

export async function prepareWindowsMemory(onSample) {
  const child = execa('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./windows-memory.ps1', import.meta.url))], { reject: false, windowsHide: true, buffer: false })
  let failure
  let started = false
  let stopping = false
  let stderr = ''
  child.stderr.on('data', data => { stderr += data })
  child.stdin.on('error', error => { if (!stopping) failure = error })
  const lines = createInterface({ input: child.stdout })
  let readyResolve
  let readyReject
  const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject })
  const timer = setTimeout(() => readyReject(new Error('Windows 内存采样器准备超时')), 60000)
  lines.on('line', (line) => {
    if (line === 'ready') { clearTimeout(timer); readyResolve(); return }
    const value = Number(line)
    if (started && Number.isFinite(value) && value > 0) onSample(value)
  })
  const done = child.then(result => {
    if (!stopping) { failure = new Error(`Windows 内存采样器异常退出：${result.exitCode}\n${stderr}`); readyReject(failure) }
  })
  const stop = async () => {
    stopping = true
    clearTimeout(timer)
    child.kill()
    await done
    lines.close()
  }
  try { await ready }
  catch (error) { await stop(); throw error }
  return {
    start(pid) { started = true; child.stdin.write(`${pid}\n`) },
    ensureRunning() { if (failure) throw failure },
    stop,
  }
}
