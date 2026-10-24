import type { ProcessIdentity } from '../../../scripts/demo-e2e-workflow/process-table'
import { createServer } from 'node:net'
import { afterEach, expect, it, vi } from 'vitest'
import * as processTable from '../../../scripts/demo-e2e-workflow/process-table'
import { assertFixtureProcessStopped, readFixtureProcessState, stopFixtureProcess } from './test-process-state'

const registered: ProcessIdentity = { pid: 51479, parent: 100, group: 51479, started: '2026-10-23T17:45:44Z' }
const owned = { pid: registered.pid, port: 31479, token: 'this-fixture-only' }
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function withPort(action: (port: number, close: () => Promise<void>) => Promise<void>) {
  const server = createServer(socket => socket.end())
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('测试监听地址无效。')
  }
  const close = async () => {
    if (server.listening) {
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    }
  }
  try {
    await action(address.port, close)
  }
  finally {
    await close()
  }
}

it('已登记后代成为 zombie 后允许退出断言，但必须确认监听端口关闭', async () => {
  vi.spyOn(processTable, 'readProcessSubset').mockResolvedValue([{ ...registered, parent: 1, zombie: true }])
  await withPort(async (port, close) => {
    await expect(assertFixtureProcessStopped({ ...owned, port }, registered)).rejects.toThrow('仍在监听')
    await close()
    await expect(assertFixtureProcessStopped({ ...owned, port }, registered)).resolves.toBeUndefined()
  })
})

it('同一出生身份仍执行时不能因端口已关闭而通过', async () => {
  vi.spyOn(processTable, 'readProcessSubset').mockResolvedValue([{ ...registered, parent: 1 }])
  await expect(assertFixtureProcessStopped(owned, registered)).rejects.toThrow('仍在执行')
})

it('PID 消失与 PID 复用分开记录，不能重新认领已失去的出生身份', async () => {
  vi.spyOn(processTable, 'readProcessSubset')
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{ ...registered, started: '2026-10-23T17:45:45Z' }])
  await expect(readFixtureProcessState(owned.pid, registered)).resolves.toEqual({ kind: 'exited' })
  await expect(readFixtureProcessState(owned.pid, registered)).resolves.toMatchObject({ kind: 'replaced' })
})

it.each([
  { ...registered, zombie: true },
  { ...registered, started: '2026-10-23T17:45:45Z' },
])('收尾不向 zombie 或已复用 PID 的端口发送退出请求：%j', async (row) => {
  vi.spyOn(processTable, 'readProcessSubset').mockResolvedValue([row])
  const request = vi.fn()
  vi.stubGlobal('fetch', request)
  await stopFixtureProcess(owned, registered)
  expect(request).not.toHaveBeenCalled()
})

it('进程身份探针失败必须保留错误，不能当作清理通过', async () => {
  const failure = new Error('process identity probe failed')
  vi.spyOn(processTable, 'readProcessSubset').mockRejectedValue(failure)
  await expect(assertFixtureProcessStopped(owned, registered)).rejects.toBe(failure)
  await expect(stopFixtureProcess(owned, registered)).rejects.toBe(failure)
})

it('端口被其它服务复用时拒绝发送退出请求', async () => {
  vi.spyOn(processTable, 'readProcessSubset').mockResolvedValue([registered])
  const request = vi.fn(async (_url: URL) => new Response('another-fixture'))
  vi.stubGlobal('fetch', request)
  await expect(stopFixtureProcess(owned, registered)).rejects.toThrow('归属凭据不匹配')
  expect(request).toHaveBeenCalledOnce()
  expect(String(request.mock.calls[0]?.[0])).not.toContain('/stop/')
})

it('协作停止确认同一进程变成 zombie 后结束，不等待操作系统回收 PID', async () => {
  vi.spyOn(processTable, 'readProcessSubset')
    .mockResolvedValueOnce([registered])
    .mockResolvedValueOnce([registered])
    .mockResolvedValue([{ ...registered, zombie: true }])
  const request = vi.fn(async (_url: URL) => new Response(owned.token))
  vi.stubGlobal('fetch', request)
  await expect(stopFixtureProcess(owned, registered)).resolves.toBeUndefined()
  expect(request).toHaveBeenCalledTimes(2)
  expect(String(request.mock.calls[1]?.[0])).toBe(`http://127.0.0.1:${owned.port}/stop/${owned.token}`)
})
