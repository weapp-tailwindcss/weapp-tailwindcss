import type { ChildProcess } from 'node:child_process'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'
import { execa } from 'execa'

function signalGroup(pid: number, signal: NodeJS.Signals | 0) {
  try {
    process.kill(-pid, signal)
    return true
  }
  catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    // SIGTERM 后可能只剩不可发送信号的进程组成员；探测 EPERM 不代表仍有本轮可清理进程。
    if (code === 'ESRCH' || (signal === 0 && code === 'EPERM')) {
      return false
    }
    throw error
  }
}

/** 仅停止以 detached 启动的本轮进程组，确保 pnpm 的 Metro 子进程也释放端口。 */
export async function stopOwnedProcess(child: ChildProcess | undefined) {
  if (!child?.pid) {
    return
  }
  if (process.platform === 'win32') {
    await execa('taskkill', ['/pid', String(child.pid), '/T', '/F'], { reject: false, timeout: 10_000 })
    return
  }
  if (!signalGroup(child.pid, 'SIGTERM')) {
    return
  }
  const deadline = Date.now() + 5_000
  while (signalGroup(child.pid, 0) && Date.now() < deadline) {
    await setTimeout(50)
  }
  if (signalGroup(child.pid, 0)) {
    signalGroup(child.pid, 'SIGKILL')
  }
}
