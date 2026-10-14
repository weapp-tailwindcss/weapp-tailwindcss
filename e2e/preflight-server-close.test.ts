import type { PreflightSession } from '../scripts/e2e-preflight/session'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { expect, it, vi } from 'vitest'
import { serve } from '../scripts/e2e-preflight/server'

vi.mock('node:http', async (original) => {
  const actual = await original<typeof import('node:http')>()
  return { ...actual, createServer: vi.fn() }
})

it('预检服务关闭保留 Node 回调错误，并仍关闭本轮连接', async () => {
  const failure = new Error('server-close-failed')
  const closeAllConnections = vi.fn()
  const host = Object.assign(new EventEmitter(), {
    listen: vi.fn((_port, _host, callback: () => void) => callback()),
    address: vi.fn(() => ({ port: 12345 })),
    close: vi.fn((callback: (error: Error) => void) => callback(failure)),
    closeAllConnections,
  })
  vi.mocked(createServer).mockReturnValue(host as never)
  const server = await serve({ report: {} } as PreflightSession)
  await expect(server.close()).rejects.toBe(failure)
  expect(closeAllConnections).toHaveBeenCalledOnce()
})
