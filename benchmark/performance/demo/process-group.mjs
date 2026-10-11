import { execa } from 'execa'

async function snapshot() {
  const { stdout } = await execa('ps', ['-Ao', 'pid=,pgid=,stat='], { timeout: 5000 })
  return stdout
}

export function liveGroupMembers(output, group) {
  return output.trim().split(/\r?\n/).flatMap((line) => {
    const [pid, pgid, state] = line.trim().split(/\s+/)
    if (!/^\d+$/.test(pid) || !/^\d+$/.test(pgid) || !state) throw new Error('无法解析进程组快照')
    return Number(pgid) === group && !state.startsWith('Z') ? [Number(pid)] : []
  })
}

export async function signalProcessGroup(pid, signal, { kill = process.kill.bind(process), inspect = snapshot } = {}) {
  try { kill(-pid, signal) }
  catch (error) {
    if (error.code === 'ESRCH') return
    // macOS 对已退出的进程组可能返回 EPERM；只在确认没有存活成员后视为清理完成。
    if (error.code === 'EPERM') {
      try { if (!liveGroupMembers(await inspect(), pid).length) return }
      catch { /* 快照失败不能掩盖原始权限错误。 */ }
    }
    throw error
  }
}
