import type { BrowserType } from 'playwright'
import type { RunContext } from './tailwind-capabilities/context'
import type { HistorySidecar } from './tailwind-capabilities/web-history/types'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { historyProbe } from './tailwind-capabilities/web-history/fixtures'
import { runHistoryWeb } from './tailwind-capabilities/web-history/run'
import { syntheticHistory } from './tailwind-capabilities/web-history/test-fixture'

const mocks = vi.hoisted(() => ({ persist: vi.fn(), closed: vi.fn(), profile: vi.fn(), failure: '', badPng: false, captureStarted: false, releaseCapture: () => {} }))
vi.mock('./tailwind-capabilities/fixture', () => ({ withGeneratorFixture: async (_root: string, _css: string, _files: unknown, run: (generator: unknown) => Promise<void>) => run({ generate: async () => ({ css: '.unit{}', classSet: new Set(['visited:border-[#123456]']) }) }) }))
vi.mock('./tailwind-capabilities/context', () => ({
  newReport: async (context: RunContext, target: string, _contracts: unknown, _fixture: unknown, environment: Record<string, string>) => {
    await mkdir(context.directory, { recursive: true })
    const hash = 'a'.repeat(64)
    return { schemaVersion: 2, runId: context.runId, target, observedAt: new Date().toISOString(), identity: { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { unit: '1' } }, environment, results: [], artifacts: [] }
  },
  persistReport: mocks.persist,
}))
vi.mock('./tailwind-capabilities/web-history/server', () => ({ historyServer: async (_css: string, _runId: string, raw: HistorySidecar) => {
  raw.origin = 'http://127.0.0.1:43210'
  return { close: async () => {
    mocks.closed()
    if (mocks.failure === 'server-close') {
      throw new Error('server close failed')
    }
    raw.cleanup.serverClosed = true
  } }
} }))
vi.mock('./tailwind-capabilities/web-history/profile', () => ({ withHistoryProfile: async (_type: unknown, engine: 'chromium', name: 'history' | 'fresh', raw: HistorySidecar, run: (context: unknown, profile: unknown) => Promise<void>) => {
  mocks.profile(name)
  if (mocks.failure === name) {
    throw new Error(`${name} failed`)
  }
  await run({}, { name })
  if (name === 'fresh') {
    const fixture = syntheticHistory(raw.runId, engine, '.unit{}')
    Object.assign(raw, fixture.raw, { cleanup: { ...fixture.raw.cleanup, serverClosed: false } })
  }
} }))
vi.mock('./tailwind-capabilities/web-history/observe', () => ({
  historyPage: async () => ({ screenshot: async ({ path: file }: { path: string }) => {
    if (mocks.failure === 'late-capture' && path.basename(file).endsWith('visited-observation-1.png')) {
      mocks.captureStarted = true
      await new Promise<void>((resolve) => {
        mocks.releaseCapture = resolve
      })
    }
    const fixture = syntheticHistory('unit-history', 'chromium', '.unit{}')
    const bytes = mocks.badPng ? Buffer.from('invalid png') : fixture.screenshots.get(path.basename(file))!
    await writeFile(file, bytes)
    return bytes
  } }),
  visitHistory: async () => {
    if (mocks.failure === 'navigation') {
      throw new Error('navigation failed')
    }
  },
  captureHistory: async (_page: unknown, state: string, _profile: unknown, raw: HistorySidecar, capture: (state: string) => Promise<void>) => {
    if (mocks.failure === 'partial-visited' && state === 'visited') {
      const fixture = syntheticHistory(raw.runId, 'chromium', '.unit{}')
      fixture.raw.states.pop()
      fixture.raw.profiles.pop()
      Object.assign(raw, fixture.raw)
      await capture('visited-observation-1')
      throw new Error('original visited observation budget exceeded')
    }
    if (mocks.failure === 'late-capture' && state === 'visited') {
      void capture('visited-observation-1').catch(() => {})
      throw new Error('original observation budget exceeded')
    }
    if (mocks.failure === state) {
      throw new Error(`${state} capture failed`)
    }
    await capture(state === 'visited' ? 'visited-observation-1' : state)
  },
}))
const directories: string[] = []
beforeEach(() => {
  vi.clearAllMocks()
  mocks.failure = ''
  mocks.badPng = false
  mocks.captureStarted = false
  mocks.releaseCapture = () => {}
})
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function run() {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-history-runner-'))
  directories.push(directory)
  const report = await runHistoryWeb({ root: directory, directory, runId: 'unit-history' }, 'chromium', { name: () => 'chromium' } as BrowserType)
  return { report, directory }
}
it('写出原始证据后生产重放，串行调用两份自有profile并关闭HTTP', async () => {
  const { report } = await run()
  expect(report.results[0]!.status).toBe('passed')
  expect(report.artifacts.filter(item => item.kind === 'screenshot')).toHaveLength(3)
  expect(mocks.profile.mock.calls).toEqual([['history'], ['fresh']])
  expect(mocks.closed).toHaveBeenCalledTimes(1)
  expect(mocks.persist).toHaveBeenCalledTimes(1)
})
it.each(['history', 'initial', 'navigation', 'visited', 'fresh', 'restored', 'server-close'])('%s失败保留原始sidecar并关闭本任务HTTP', async (failure) => {
  mocks.failure = failure
  const { report, directory } = await run()
  expect(report.results[0]!.status).toBe('failed')
  expect(report.results[0]!.reason).toContain(failure === 'server-close' ? 'server close failed' : failure)
  expect(mocks.closed).toHaveBeenCalledTimes(1)
  expect(mocks.persist).toHaveBeenCalledTimes(1)
  expect(JSON.parse(await readFile(path.join(directory, 'history', 'measurements.json'), 'utf8')).error).toBeTruthy()
})
it('损坏PNG写为failed而不是丢失报告', async () => {
  mocks.badPng = true
  const { report } = await run()
  expect(report.results[0]!.status).toBe('failed')
  expect(report.results[0]!.reason).toContain('原始证据复读失败')
})
it('部分观察超时保留已采样断言与原错，不创建恢复profile或虚假ENOENT', async () => {
  mocks.failure = 'partial-visited'
  const { report } = await run()
  const result = report.results[0]!
  expect(result.status).toBe('failed')
  expect(result.reason).toContain('Error: original visited observation budget exceeded')
  expect(result.reason).not.toMatch(/ENOENT|原始证据复读失败/)
  expect(result.assertions.length).toBeGreaterThan(100)
  expect(result.assertions.find(item => item.name === 'restored/probe/pixel/top/red')?.actual).toBeNull()
  expect(mocks.profile.mock.calls).toEqual([['history']])
  expect(mocks.closed).toHaveBeenCalledOnce()
})
it('观察超时后结算仍存活的截图与receipt再冻结报告，不留下迟到写入', async () => {
  mocks.failure = 'late-capture'
  let finished = false
  const pending = run().then((result) => {
    finished = true
    return result
  })
  try {
    await vi.waitFor(() => expect(mocks.captureStarted).toBe(true))
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(finished).toBe(false)
  }
  finally {
    mocks.releaseCapture()
  }
  const { report } = await pending
  expect(report.results[0]!.status).toBe('failed')
  expect(report.results[0]!.reason).toContain('original observation budget exceeded')
  expect(report.artifacts.filter(item => item.kind === 'screenshot')).toHaveLength(2)
  const frozen = JSON.stringify(report)
  await new Promise(resolve => setTimeout(resolve, 10))
  expect(JSON.stringify(report)).toBe(frozen)
})
it('过滤不匹配时不能启动profile或HTTP', async () => {
  await expect(runHistoryWeb({ root: 'unit', directory: 'unit', runId: 'unit', caseFilter: /^other$/ }, 'chromium', { name: () => 'chromium' } as BrowserType)).rejects.toThrow(/没有匹配/)
  expect(mocks.profile).not.toHaveBeenCalled()
  expect(mocks.closed).not.toHaveBeenCalled()
  expect(historyProbe.features).toEqual(['variant/static/visited'])
})
