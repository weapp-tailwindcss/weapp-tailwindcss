import type { Browser, BrowserContextOptions } from 'playwright'
import type { RunContext } from './tailwind-capabilities/context'
import type { CaseContract } from './tailwind-capabilities/types'
import { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { filesystemObservedAt } from './tailwind-capabilities/artifact-clock'
import { contextWebCandidates } from './tailwind-capabilities/web-context/fixtures'
import { runContextWeb } from './tailwind-capabilities/web-context/run'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), observe: vi.fn(), activate: vi.fn(), persist: vi.fn() }))

vi.mock('./tailwind-capabilities/fixture', () => ({ withGeneratorFixture: async (_root: string, _css: string, _files: unknown, run: (generator: unknown) => Promise<void>) => run({ generate: mocks.generate }) }))
vi.mock('./tailwind-capabilities/web-context/observe', () => ({ observeContextState: mocks.observe }))
vi.mock('./tailwind-capabilities/web-context/actions', () => ({ activateContextState: mocks.activate }))
vi.mock('./tailwind-capabilities/context', () => ({
  newReport: async (context: RunContext, target: string, _contracts: CaseContract[], _fixture: unknown, environment: Record<string, string | number | boolean>) => {
    await mkdir(context.directory, { recursive: true })
    const hash = 'a'.repeat(64)
    const identity = { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.3.3' } }
    return { schemaVersion: 2, runId: context.runId, target, observedAt: filesystemObservedAt(context.directory), identity, environment, results: [], artifacts: [] }
  },
  persistReport: mocks.persist,
}))

const directories: string[] = []
beforeEach(() => {
  vi.clearAllMocks()
  mocks.generate.mockResolvedValue({ css: '.context-fixture{display:block}', classSet: new Set(contextWebCandidates) })
  mocks.observe.mockImplementation(async (_page, step) => ({ values: step.expected, events: [] }))
  mocks.activate.mockResolvedValue(undefined)
})
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

function browserFixture(options: { failPage?: boolean, failClose?: boolean } = {}) {
  const contexts: Array<{ options: BrowserContextOptions, page: { setContent: ReturnType<typeof vi.fn>, screenshot: ReturnType<typeof vi.fn>, on: ReturnType<typeof vi.fn> }, close: ReturnType<typeof vi.fn>, newPage: ReturnType<typeof vi.fn> }> = []
  const browser = {
    version: () => 'mock-context-protocol',
    close: vi.fn(),
    newContext: vi.fn(async (profile: BrowserContextOptions) => {
      const page = {
        setContent: vi.fn(async () => {}),
        screenshot: vi.fn(async ({ path: file }: { path: string }) => { await writeFile(file, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')) }),
        on: vi.fn(),
      }
      const entry = {
        options: profile,
        page,
        close: vi.fn(async () => {
          if (options.failClose && profile.hasTouch) {
            throw new Error('owned touch context close failed')
          }
        }),
        newPage: vi.fn(async () => {
          if (options.failPage && profile.hasTouch) {
            throw new Error('owned touch page creation failed')
          }
          return page
        }),
      }
      contexts.push(entry)
      return entry
    }),
  }
  return { browser: browser as unknown as Browser, contexts, close: browser.close, create: browser.newContext }
}

async function contextFixture(caseFilter?: RegExp): Promise<RunContext> {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-context-protocol-'))
  directories.push(directory)
  return { root: directory, directory, runId: 'context-runner-protocol', caseFilter }
}

describe('独立 context runner 的调度与资源边界', () => {
  it('借用同一 browser，按需复用三个 context/page，并保存各状态原始证据', async () => {
    const context = await contextFixture()
    const fixture = browserFixture()
    const report = await runContextWeb(context, 'chromium', fixture.browser)
    expect(report.results).toHaveLength(7)
    expect(report.results.every(result => result.status === 'passed')).toBe(true)
    expect(fixture.create).toHaveBeenCalledTimes(3)
    expect(fixture.contexts.map(entry => [entry.options.hasTouch, entry.options.javaScriptEnabled])).toEqual([[false, true], [true, true], [false, false]])
    expect(fixture.contexts.every(entry => entry.newPage.mock.calls.length === 1 && entry.close.mock.calls.length === 1)).toBe(true)
    expect(fixture.close).not.toHaveBeenCalled()
    expect(report.artifacts.filter(artifact => artifact.kind === 'screenshot')).toHaveLength(27)
    const saved = JSON.parse(await readFile(path.join(context.directory, 'context', 'context-user-invalid.json'), 'utf8'))
    expect(saved.measurements.map((measurement: { state: string }) => measurement.state)).toEqual(['pristine', 'invalid-blurred', 'invalid-submitted', 'valid-blurred', 'valid-submitted', 'reset'])
    expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ directory: path.join(context.directory, 'context') }), report, expect.anything())
  })

  it('newPage 失败仍清理已创建 context，不反复重建失败的设备环境', async () => {
    const context = await contextFixture(/^runtime\/context-(?:any-)?pointer-/)
    const fixture = browserFixture({ failPage: true })
    const report = await runContextWeb(context, 'chromium', fixture.browser)
    expect(report.results).toHaveLength(4)
    expect(report.results.every(result => result.status === 'failed' && result.support === 'supported')).toBe(true)
    expect(fixture.create).toHaveBeenCalledTimes(2)
    expect(fixture.contexts.every(entry => entry.close.mock.calls.length === 1)).toBe(true)
    expect(fixture.close).not.toHaveBeenCalled()
  })

  it('颜色正确但媒体环境错误仍失败，不能自动改成 unsupported', async () => {
    const context = await contextFixture(/^runtime\/context-pointer-coarse$/)
    const fixture = browserFixture()
    mocks.observe.mockImplementation(async (_page, step) => ({ values: { ...step.expected, 'media/(pointer: coarse)': false }, events: [] }))
    const report = await runContextWeb(context, 'chromium', fixture.browser)
    expect(report.results[0]).toMatchObject({ status: 'failed', support: 'supported' })
    expect(fixture.contexts.every(entry => entry.close.mock.calls.length === 1)).toBe(true)
    expect(fixture.close).not.toHaveBeenCalled()
  })

  it('原生交互异常后仍关闭本任务 context，后续案例继续保留结果', async () => {
    const context = await contextFixture(/^runtime\/context-user-/)
    const fixture = browserFixture()
    mocks.activate.mockRejectedValueOnce(new Error('native input failed'))
    const report = await runContextWeb(context, 'chromium', fixture.browser)
    expect(report.results.map(result => result.status)).toEqual(['failed', 'passed'])
    expect(fixture.contexts[0]!.close).toHaveBeenCalledOnce()
    expect(fixture.close).not.toHaveBeenCalled()
  })

  it('本任务 context 清理失败写入报告，不能吞掉错误或关闭共享 browser', async () => {
    const context = await contextFixture(/^runtime\/context-pointer-coarse$/)
    const fixture = browserFixture({ failClose: true })
    const report = await runContextWeb(context, 'chromium', fixture.browser)
    expect(report.results[0]).toMatchObject({ status: 'failed', reason: expect.stringContaining('touch') })
    expect(report.environment.cleanupError).toContain('owned touch context close failed')
    expect(fixture.close).not.toHaveBeenCalled()
  })

  it('空过滤不创建上下文，也不能返回空的成功报告', async () => {
    const fixture = browserFixture()
    await expect(runContextWeb(await contextFixture(/^does-not-match$/), 'chromium', fixture.browser)).rejects.toThrow('没有匹配')
    expect(fixture.create).not.toHaveBeenCalled()
    expect(fixture.close).not.toHaveBeenCalled()
  })
})
