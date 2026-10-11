import { fork } from 'node:child_process'

export function runIsolatedScenario(config, id, warmups, runs) {
  return new Promise((resolve, reject) => {
    // 每个场景独占进程，避免前序场景的缓存、JIT 和堆占用污染测量。
    const child = fork(new URL('../scripts/scenario-worker.mjs', import.meta.url), [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      timeout: 120_000,
    })
    let result
    let diagnostics = ''
    const collect = (chunk) => {
      diagnostics = `${diagnostics}${chunk}`.slice(-65_536)
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    child.on('message', (message) => {
      result = message
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code !== 0 || !result) {
        reject(new Error(`场景 ${id} 测量失败 (${signal ?? code}): ${diagnostics}`))
        return
      }
      resolve(result)
    })
    child.send({ config, id, warmups, runs })
  })
}
