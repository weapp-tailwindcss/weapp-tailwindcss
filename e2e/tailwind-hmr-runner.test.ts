import type { Browser } from 'playwright'
import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { runHmr } from './tailwind-capabilities/hmr'

const state = vi.hoisted(() => ({ failure: '', page: undefined as EventEmitter | undefined, launch: vi.fn() }))
vi.mock('playwright', () => ({ chromium: { launch: state.launch, executablePath: () => '/unit/full-chromium' }, firefox: { launch: state.launch }, webkit: { launch: state.launch } }))
vi.mock('./tailwind-capabilities/context', () => ({
  newReport: async (context: { directory: string }, _target: unknown, _contracts: unknown, _fixture: unknown, environment: unknown) => {
    await mkdir(context.directory, { recursive: true })
    return { environment, results: [], artifacts: [], identity: {} }
  },
  persistReport: vi.fn(),
}))
vi.mock('./tailwind-capabilities/report', async original => ({ ...await original<typeof import('./tailwind-capabilities/report')>(), validateCapabilityReport: vi.fn(), verifyReportArtifacts: vi.fn() }))
vi.mock('./tailwind-capabilities/hmr/server', () => ({
  withHmrServer: async (root: string, _runId: string, logs: string[], run: (server: unknown) => Promise<void>) => {
    await run({ source: path.join(root, 'probe.js'), instance: 'unit-instance', url: 'http://127.0.0.1:43210/' })
    // 模拟真实 withHmrServer 的异步关闭窗口，不把这些事件当作浏览器能力证据。
    if (state.failure === 'late-browser') {
      state.page!.emit('pageerror', new Error('late browser failure'))
    }
    if (state.failure === 'late-server') {
      logs.push('error:late server failure')
    }
  },
}))
const directories: string[] = []
beforeEach(() => {
  vi.clearAllMocks()
  state.failure = ''
  state.page = undefined
})
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

function browserFixture() {
  const page = new EventEmitter()
  const socket = new EventEmitter()
  state.page = page
  let actual = { marker: 'unit-hmr/initial', width: 80, session: 'initial-page', instance: 'unit-instance' }
  Object.assign(page, {
    locator: () => ({ evaluate: async () => actual, waitFor: async () => {}, allTextContents: async () => ['.unit{}'] }),
    goto: async () => { page.emit('websocket', socket) },
    reload: async () => { actual = { ...actual, session: 'refreshed-page' } },
    waitForFunction: async (_callback: unknown, value: { marker: string, width: number }) => {
      actual = { ...actual, ...value }
      socket.emit('framereceived', { payload: JSON.stringify({ type: 'update', updates: [{ path: '/probe.js' }] }) })
    },
    screenshot: async () => Buffer.from('synthetic lifecycle bytes; not runtime evidence'),
    content: async () => '<html>synthetic lifecycle fixture</html>',
  })
  const owned = { addInitScript: async () => {}, newPage: vi.fn().mockResolvedValue(page), close: vi.fn().mockResolvedValue(undefined) }
  const browser = { version: () => 'synthetic-lifecycle', newContext: vi.fn().mockResolvedValue(owned), close: vi.fn().mockResolvedValue(undefined) }
  state.launch.mockResolvedValue(browser)
  return { browser: browser as unknown as Browser, owned, sharedClose: browser.close, newContext: browser.newContext }
}

async function run(browser?: Browser) {
  const directory = await mkdtemp(path.join(tmpdir(), 'hmr-runner-'))
  directories.push(directory)
  const report = await runHmr({ root: directory, directory, runId: 'unit-hmr' }, 'chromium', browser)
  return { report, directory }
}

it('合成生命周期完整时关闭自有 context，保留借用 browser', async () => {
  const fixture = browserFixture()
  const { report } = await run(fixture.browser)
  expect(report.results[0]!.status).toBe('passed')
  expect(report.results[0]!.assertions).toHaveLength(26)
  expect(fixture.owned.close).toHaveBeenCalledOnce()
  expect(fixture.sharedClose).not.toHaveBeenCalled()
})

it.each(['late-browser', 'late-server'])('服务收尾阶段的 %s 仍拒绝全断言通过的报告并保留原始错误', async (failure) => {
  state.failure = failure
  const fixture = browserFixture()
  const { report, directory } = await run(fixture.browser)
  expect(report.results[0]!.assertions).toHaveLength(26)
  expect(report.results[0]!.status).toBe('failed')
  expect(report.results[0]!.reason).toContain(failure === 'late-browser' ? 'late browser failure' : 'late server failure')
  if (failure === 'late-browser') {
    const raw = JSON.parse(await readFile(path.join(directory, 'hmr', 'measurements.json'), 'utf8'))
    expect(raw.browserEvents).toMatchObject([{ event: 'page-error', stage: 'refresh', message: expect.stringContaining('late browser failure') }])
  }
  expect(fixture.sharedClose).not.toHaveBeenCalled()
})

it.each([true, false])('创建 context 失败按真实 browser 归属清理，借用=%s', async (borrowed) => {
  const fixture = browserFixture()
  fixture.newContext.mockRejectedValue(new Error('newContext unavailable'))
  const { report } = await run(borrowed ? fixture.browser : undefined)
  expect(report.results[0]!.status).toBe('failed')
  expect(report.results[0]!.reason).toContain('newContext unavailable')
  expect(fixture.sharedClose).toHaveBeenCalledTimes(borrowed ? 0 : 1)
  expect(fixture.owned.close).not.toHaveBeenCalled()
})
