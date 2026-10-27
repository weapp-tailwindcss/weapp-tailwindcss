import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import { createConnection } from 'node:net'
import { setTimeout as delay } from 'node:timers/promises'
import { readProcessSubset } from '../../../scripts/demo-e2e-workflow/process-table'

export interface FixtureProcess {
  pid: number
  port: number
  token: string
}

/** PID 可在退出后保留为 zombie，也可被复用；只有同一出生身份仍执行才算残留。 */
export async function readFixtureProcessState(pid: number, expected?: ProcessIdentity) {
  const current = (await readProcessSubset(undefined, [pid])).find(row => row.pid === pid)
  if (!current) {
    return { kind: 'exited' as const }
  }
  if (expected && current.started !== expected.started) {
    return { kind: 'replaced' as const, identity: current }
  }
  return { kind: current.zombie ? 'zombie' as const : 'running' as const, identity: current }
}

/** 同时检查已登记进程身份与监听资源；连接超时或其它探针失败不能证明端口释放。 */
export async function assertFixtureProcessStopped(owned: FixtureProcess, expected?: ProcessIdentity) {
  const state = await readFixtureProcessState(owned.pid, expected)
  if (state.kind === 'running') {
    throw new Error(`合成后代仍在执行：${JSON.stringify(state.identity)}`)
  }
  await new Promise<void>((resolve, reject) => {
    const socket = createConnection({ host: '127.0.0.1', port: owned.port })
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (error?: Error) => {
      clearTimeout(timer)
      socket.destroy()
      if (error) {
        reject(error)
      }
      else {
        resolve()
      }
    }
    timer = setTimeout(() => finish(new Error(`合成后代端口 ${owned.port} 的退出探针超时。`)), 500)
    socket.once('connect', () => finish(new Error(`合成后代端口 ${owned.port} 仍在监听。`)))
    socket.once('error', (error: NodeJS.ErrnoException) => finish(error.code === 'ECONNREFUSED' ? undefined : error))
  })
}

/** 失败收尾只请求本轮凭据绑定的服务退出，不向历史 PID 或已退出的 zombie 发终止信号。 */
export async function stopFixtureProcess(owned: FixtureProcess, expected?: ProcessIdentity) {
  const state = await readFixtureProcessState(owned.pid, expected)
  if (state.kind !== 'running') {
    return
  }
  const url = new URL(`http://127.0.0.1:${owned.port}/`)
  const identity = await fetch(url, { signal: AbortSignal.timeout(2000) }).catch(async (error) => {
    if ((await readFixtureProcessState(owned.pid, state.identity)).kind === 'running') {
      throw error
    }
  })
  if (!identity) {
    return
  }
  if (await identity.text() !== owned.token) {
    throw new Error(`合成后代端口 ${owned.port} 的本轮归属凭据不匹配，拒绝发送退出请求。`)
  }
  if ((await readFixtureProcessState(owned.pid, state.identity)).kind !== 'running') {
    return
  }
  const deadline = Date.now() + 2000
  await fetch(new URL(`stop/${owned.token}`, url), { signal: AbortSignal.timeout(2000) }).catch(async (error) => {
    if ((await readFixtureProcessState(owned.pid, state.identity)).kind === 'running') {
      throw error
    }
  })
  while ((await readFixtureProcessState(owned.pid, state.identity)).kind === 'running') {
    if (Date.now() >= deadline) {
      throw new Error(`合成后代 pid=${owned.pid} started=${state.identity.started} 的协作收尾未确认。`)
    }
    await delay(Math.min(10, Math.max(0, deadline - Date.now())))
  }
}
