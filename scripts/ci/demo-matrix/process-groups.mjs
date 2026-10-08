import assert from 'node:assert/strict'
import process from 'node:process'
import { execa } from 'execa'

export function ownedProcessGroups(table, rootPid) {
  const rows = table.trim().split('\n').map(line => line.trim().split(/\s+/).map(Number))
  const descendants = new Set([rootPid])
  let changed = true
  while (changed) {
    changed = false
    for (const [pid, parent] of rows) {
      if (descendants.has(parent) && !descendants.has(pid)) {
        descendants.add(pid)
        changed = true
      }
    }
  }
  // 只返回由本次进程树拥有的组，不能给继承自调用方的共享组发信号。
  return [...new Set([rootPid, ...rows.filter(([pid, , group]) => descendants.has(pid) && descendants.has(group)).map(([, , group]) => group)])]
}

export async function captureOwnedProcessGroups(rootPid) {
  const result = await execa('ps', ['-A', '-o', 'pid=,ppid=,pgid='])
  return ownedProcessGroups(result.stdout, rootPid)
}

export function hasLiveGroupMembers(table, group) {
  const rows = table.trim() ? table.trim().split('\n').map(line => line.trim().split(/\s+/)) : []
  assert.ok(rows.every(([pgid, state]) => Number.isInteger(Number(pgid)) && /^[A-Z]/.test(state ?? '')), '无法确认进程组状态：ps 输出无效')
  return rows.some(([pgid, state]) => Number(pgid) === group && !state.startsWith('Z'))
}

export async function signalOwnedProcessGroup(group, signal, kill = process.kill.bind(process), readGroups = async () => {
  return (await execa('ps', ['-A', '-o', 'pgid=,stat='])).stdout
}) {
  try {
    kill(-group, signal)
  }
  catch (error) {
    if (error.code === 'ESRCH') {
      return
    }
    // macOS 对仅剩僵尸进程的组返回 EPERM；活进程的权限错误必须继续报告。
    if (error.code === 'EPERM' && !hasLiveGroupMembers(await readGroups(), group)) {
      return
    }
    throw error
  }
}
