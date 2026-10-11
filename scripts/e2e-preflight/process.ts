import type { HBuilderXCommandOptions } from '../../packages/hbuilderx-runner/src/types'
import { spawnSync } from 'node:child_process'
import process from 'node:process'
import { killProcessTree, spawnCommand } from '../../packages/hbuilderx-runner/src/process'

export async function runOwnedWorker(options: HBuilderXCommandOptions, signal?: AbortSignal) {
  signal?.throwIfAborted()
  const worker = spawnCommand(options)
  let reason = ''
  const stop = (message: string) => {
    reason = message
    // 只终止本次创建的进程树，绝不按进程名称清理 IDE 或设备。
    if (process.platform === 'win32' && worker.child.pid && worker.child.exitCode == null) {
      const killed = spawnSync('taskkill', ['/pid', String(worker.child.pid), '/t', '/f'], { timeout: 5000, windowsHide: true, stdio: 'ignore' })
      if (killed.error || killed.status !== 0) {
        worker.child.kill('SIGKILL')
      }
    }
    else {
      killProcessTree(worker.child, 'SIGKILL')
    }
  }
  const aborted = () => stop('预检已中断')
  signal?.addEventListener('abort', aborted, { once: true })
  const timer = setTimeout(stop, options.timeoutMs ?? 120_000, `预检探针超时 ${options.timeoutMs}ms`)
  try {
    const exit = await worker.closed
    const output = worker.logs.join('').slice(-16_000)
    if (reason || exit.code !== 0) {
      throw new Error(`${reason || '探针失败'}；command=${options.command} ${options.args.join(' ')}\ncwd=${options.cwd}\nexit=${exit.code} signal=${exit.signal}\n${output}`)
    }
    return output
  }
  finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', aborted)
  }
}
