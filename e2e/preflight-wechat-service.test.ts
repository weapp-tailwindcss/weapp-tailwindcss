import type { ProbeContext } from '../scripts/e2e-preflight/types'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { wechat } from '../scripts/e2e-preflight/probes/desktop'
import { Launcher } from '../scripts/wechat/automator'
import { ownedWechatEndpoint, wechatRequest } from '../scripts/wechat/service'

vi.mock('../scripts/e2e-preflight/probes/wechat-version', () => ({ wechatVersion: vi.fn().mockResolvedValue({ version: '2.02.2608080', metadata: 'fixture-metadata' }) }))
vi.mock('../scripts/e2e-preflight/probes/port', () => ({ availablePort: vi.fn().mockResolvedValue(45678) }))
let context: ProbeContext
const closes: Array<() => Promise<void>> = []
beforeEach(async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-wechat-probe-service-'))
  context = { root: dir, dir, runId: 'http-probe', url: 'http://127.0.0.1:1', phase: 'prepare' }
  vi.stubEnv('E2E_PREFLIGHT_WECHAT_CLI', 'fixture-cli')
  vi.stubEnv('E2E_WECHAT_LOCK_DIRECTORY', dir)
  vi.stubEnv('E2E_PREFLIGHT_WECHAT_APPID', 'wx6ffee4673b257014')
  vi.stubEnv('E2E_TEMPLATE_IDE_APP_ID', undefined)
  vi.spyOn(Launcher.prototype, 'connect').mockRejectedValue(new Error('unexpected connection'))
})
afterEach(async () => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(closes.splice(0).map(close => close()))
  await rm(context.dir, { recursive: true, force: true })
})

async function fixture(options: { autoStatus?: number, login?: (count: number) => boolean } = {}) {
  const requests: string[] = []
  let loginCount = 0
  const server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://127.0.0.1')
    requests.push(url.pathname)
    if (url.pathname === '/v2/isLogin') {
      res.end(JSON.stringify({ login: options.login?.(++loginCount) ?? true }))
    }
    else if (url.pathname === '/v2/auto') {
      res.statusCode = options.autoStatus ?? 200
      res.end(res.statusCode === 200 ? JSON.stringify('s123') : '{"error":"rejected"}')
    }
    else {
      res.end('{"success":true}')
    }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  closes.push(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())))
  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new Error('fixture 未监听本地端口')
  }
  const port = String(address.port)
  vi.stubEnv('E2E_PREFLIGHT_WECHAT_HTTP_PORT', port)
  return { port, requests }
}

it.each([401, 500])('auto HTTP %s 后不连接、不请求关闭或刷新认证', async (autoStatus) => {
  const { requests } = await fixture({ autoStatus })
  await expect(wechat(context)).rejects.toThrow(`HTTP ${autoStatus}`)
  expect(requests).toEqual(['/v2/isLogin', '/v2/auto'])
  expect(Launcher.prototype.connect).not.toHaveBeenCalled()
})

it('auto 后发现认证失效，从该时刻起不再发出 HTTP 请求', async () => {
  const { requests } = await fixture({ login: count => count === 1 })
  await expect(wechat(context)).rejects.toThrow('执行与会话收尾均失败')
  expect(requests).toEqual(['/v2/isLogin', '/v2/auto', '/v2/isLogin'])
  expect(Launcher.prototype.connect).not.toHaveBeenCalled()
})

it('已有同项目租约时预检被拒绝，原连接仍归原 owner 持有', async () => {
  const { port, requests } = await fixture()
  const project = path.join(context.dir, 'wechat-project')
  await wechatRequest(port, { kind: 'auto', project, port: 45678 })
  try {
    await expect(wechat(context)).rejects.toThrow('已有活跃会话')
    expect(requests).toEqual(['/v2/auto', '/v2/isLogin'])
    expect(ownedWechatEndpoint(project)).toBe('ws://127.0.0.1:45678')
    expect(Launcher.prototype.connect).not.toHaveBeenCalled()
  }
  finally {
    await wechatRequest(port, { kind: 'close', project })
  }
})

it('初始登录未确认时，不打开或关闭任何项目', async () => {
  const { requests } = await fixture({ login: () => false })
  await expect(wechat(context)).rejects.toThrow('登录未确认')
  expect(requests).toEqual(['/v2/isLogin'])
})
