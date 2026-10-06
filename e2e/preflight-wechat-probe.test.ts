import type { MiniProgram } from '@weapp-vite/miniprogram-automator'
import type { ProbeContext } from '../scripts/e2e-preflight/types'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { formatWorkflowError } from '../scripts/e2e-preflight/cleanup'
import { wechat } from '../scripts/e2e-preflight/probes/desktop'
import { Launcher } from '../scripts/wechat/automator'
import { existingWechatService, wechatRequest } from '../scripts/wechat/service'

vi.mock('../scripts/wechat/service', () => ({ assertWechatLogin: vi.fn(), existingWechatService: vi.fn(), wechatRequest: vi.fn() }))
const dirs: string[] = []
beforeEach(() => {
  vi.stubEnv('E2E_PREFLIGHT_WECHAT_APPID', undefined)
  vi.stubEnv('E2E_TEMPLATE_IDE_APP_ID', undefined)
  vi.mocked(existingWechatService).mockResolvedValue({ command: 'fake-cli', version: '2.02.2609231', metadata: 'fake-metadata', httpPort: '12345' })
  vi.mocked(wechatRequest).mockImplementation(async (_port, operation) => operation.kind === 'auto' ? { autoPort: operation.port } : { success: true })
})

async function context(): Promise<ProbeContext> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-owned-probe-'))
  dirs.push(dir)
  return { root: dir, dir, runId: 'owned-probe', url: 'http://127.0.0.1:1', phase: 'prepare' }
}

it('auto 被拒绝时不关闭已有项目，也不覆盖原始错误链', async () => {
  const primary = new AggregateError([new Error('active owner'), new Error('lease conflict')], 'auto rejected')
  vi.mocked(wechatRequest).mockRejectedValue(primary)
  const error = await wechat(await context()).catch(error => error)
  expect(wechatRequest).toHaveBeenCalledTimes(1)
  expect(formatWorkflowError(error)).toContain('lease conflict')
  expect(error.cause).toBe(primary)
})

it('本轮 auto 成功而连接未返回时，原端口清理失败也保留在错误链', async () => {
  const primary = new AggregateError([new Error('handshake failed'), new Error('disconnect failed')], 'connection failed')
  vi.spyOn(Launcher.prototype, 'connect').mockRejectedValue(primary)
  vi.mocked(wechatRequest).mockImplementation(async (_port, operation) => {
    if (operation.kind === 'auto') {
      return { autoPort: operation.port }
    }
    throw new Error('close denied')
  })
  const error = await wechat(await context()).catch(error => error)
  expect(wechatRequest).toHaveBeenCalledTimes(2)
  expect(vi.mocked(wechatRequest).mock.lastCall).toEqual(['12345', expect.objectContaining({ kind: 'close' }), 10_000])
  expect(error).toBeInstanceOf(AggregateError)
  expect(formatWorkflowError(error)).toContain('handshake failed')
  expect(formatWorkflowError(error)).toContain('disconnect failed')
  expect(formatWorkflowError(error)).toContain('close denied')
})

it('auto 返回后回执校验失败仍关闭本轮打开的项目', async () => {
  vi.mocked(wechatRequest).mockResolvedValue({ autoPort: -1 })
  await expect(wechat(await context())).rejects.toThrow('自动化端口与本轮请求不一致')
  expect(vi.mocked(wechatRequest).mock.lastCall?.[1]).toMatchObject({ kind: 'close' })
})
afterEach(async () => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true })))
})

it.each([undefined, 'E2E_PREFLIGHT_WECHAT_APPID', 'E2E_TEMPLATE_IDE_APP_ID'])('预检项目、结果绑定及实时复查共用 AppID：%s', async (key) => {
  const appid = key ? 'wx0123456789abcdef' : 'wx6ffee4673b257014'
  if (key) {
    vi.stubEnv(key, appid)
  }
  const dir = await mkdtemp(path.join(os.tmpdir(), 'wt-appid-probe-'))
  dirs.push(dir)
  const context: ProbeContext = { root: dir, dir, runId: 'test-appid', url: 'http://127.0.0.1:1', phase: 'prepare' }
  let clicked = false
  const page = {
    $: async (selector: string) => ({
      text: async () => selector === '#marker' ? context.runId : String(clicked),
      tap: async () => { clicked = true },
    }),
    data: async () => ({ clicked }),
  }
  const mini = {
    currentPage: vi.fn().mockResolvedValue(page),
    screenshot: vi.fn(async ({ path: target }: { path: string }) => {
      await writeFile(target, PNG.sync.write(new PNG({ width: 20, height: 20 })))
    }),
    disconnect: vi.fn(),
  }
  vi.spyOn(Launcher.prototype, 'connect').mockResolvedValue(mini as unknown as MiniProgram)
  const prepared = await wechat(context)
  const manifest = JSON.parse(await readFile(path.join(dir, 'wechat-project', 'project.config.json'), 'utf8'))
  expect(manifest.appid).toBe(appid)
  expect(prepared.binding).toMatchObject({ appid, httpPort: '12345' })
  expect(clicked).toBe(true)
  expect(mini.disconnect).toHaveBeenCalledTimes(1)
  const calls = vi.mocked(wechatRequest).mock.calls.length
  await expect(wechat({ ...context, phase: 'live', binding: prepared.binding })).resolves.toHaveProperty('binding.appid', appid)
  expect(wechatRequest).toHaveBeenCalledTimes(calls)
})

it('App 就绪、失败截图、断连及关闭同时失败时保留完整错误链', async () => {
  const primary = new Error('App readiness failed')
  const mini = {
    waitForAppReady: vi.fn().mockRejectedValue(primary),
    screenshot: vi.fn().mockRejectedValue(new Error('screenshot failed')),
    disconnect: vi.fn().mockRejectedValue(new Error('disconnect failed')),
  }
  vi.spyOn(Launcher.prototype, 'connect').mockResolvedValue(mini as unknown as MiniProgram)
  vi.mocked(wechatRequest).mockImplementation(async (_port, operation) => {
    if (operation.kind === 'auto') {
      return { autoPort: operation.port }
    }
    throw new Error('close failed')
  })
  const error = await wechat(await context()).catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  for (const message of ['App readiness failed', 'screenshot failed', 'disconnect failed', 'close failed']) {
    expect(formatWorkflowError(error)).toContain(message)
  }
  expect(mini.disconnect).toHaveBeenCalledOnce()
  expect(vi.mocked(wechatRequest).mock.lastCall?.[1]).toMatchObject({ kind: 'close' })
})
