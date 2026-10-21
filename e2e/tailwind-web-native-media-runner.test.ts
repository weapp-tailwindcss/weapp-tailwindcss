import type { Browser } from 'playwright'
import type { RunContext } from './tailwind-capabilities/context'
import type { CapabilityReport } from './tailwind-capabilities/types'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { digest } from './tailwind-capabilities/identity'
import { nativeMediaProbe } from './tailwind-capabilities/web-native-media/fixtures'
import { runNativeMediaWeb } from './tailwind-capabilities/web-native-media/run'
import { syntheticMedia } from './tailwind-capabilities/web-native-media/test-fixture'

const mocks = vi.hoisted(() => ({ persist: vi.fn(), badPng: false }))
vi.mock('./tailwind-capabilities/fixture', () => ({ withGeneratorFixture: async (_root: string, _css: string, _files: unknown, run: (generator: unknown) => Promise<void>) => run({ generate: async () => ({ css: '.unit{}', classSet: new Set(['contrast-less:bg-[#123456]']) }) }) }))
vi.mock('./tailwind-capabilities/context', () => ({
  newReport: async (context: RunContext, target: string, _contracts: unknown, _fixture: unknown, environment: Record<string, string>) => {
    await mkdir(context.directory, { recursive: true })
    const hash = 'a'.repeat(64)
    return { schemaVersion: 2, runId: context.runId, target, observedAt: new Date().toISOString(), identity: { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { unit: '1' } }, environment, results: [], artifacts: [] }
  },
  persistReport: mocks.persist,
}))
vi.mock('./tailwind-capabilities/web-native-media/native', async (original) => {
  const actual = await original<typeof import('./tailwind-capabilities/web-native-media/native')>()
  return { ...actual, observeNativeContrast: async (_page: unknown, observation: unknown, capture: (name: string) => Promise<string>) => {
    const fixture = syntheticMedia('unit-media', digest('.unit{}'))
    Object.assign(observation as object, fixture.observation)
    for (const state of fixture.observation.states) {
      state.screenshot = await capture(state.name)
    }
  } }
})
const directories: string[] = []
beforeEach(() => {
  mocks.persist.mockReset()
  mocks.badPng = false
})
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})
async function setup(failure?: 'page' | 'close') {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'native-media-runner-'))
  directories.push(directory)
  const close = vi.fn(async () => {
    if (failure === 'close') {
      throw new Error('close failed')
    }
  })
  const page = { on: vi.fn(), setDefaultTimeout: vi.fn(), setDefaultNavigationTimeout: vi.fn(), route: vi.fn(), goto: vi.fn(), screenshot: async ({ path: file }: { path: string }) => {
    const bytes = syntheticMedia('unit-media', digest('.unit{}')).screenshots.get(path.basename(file))!
    await writeFile(file, mocks.badPng ? 'invalid png' : bytes)
  } }
  const browser = { version: () => 'mock-browser', close: vi.fn(), newContext: vi.fn(async () => ({ close, newPage: async () => {
    if (failure === 'page') {
      throw new Error('newPage failed')
    }
    return page
  } })) }
  return { directory, close, browser, context: { root: directory, directory, runId: 'unit-media' } }
}
async function run(failure?: 'page' | 'close') {
  const fixture = await setup(failure)
  const report = await runNativeMediaWeb(fixture.context, 'chromium', fixture.browser as unknown as Browser)
  return { ...fixture, report }
}

it('借用Browser，写后重读证据并持久化通过结果', async () => {
  const { report, browser, close } = await run()
  expect(report.results[0]!.status).toBe('passed')
  expect(report.artifacts.filter(item => item.kind === 'screenshot')).toHaveLength(5)
  expect(close).toHaveBeenCalledTimes(1)
  expect(browser.close).not.toHaveBeenCalled()
  expect(mocks.persist).toHaveBeenCalledTimes(1)
})

it.each(['page', 'close'] as const)('%s失败也写出failed报告且不关闭借用Browser', async (failure) => {
  const { report, browser, close, directory } = await run(failure)
  expect(report.results[0]!.status).toBe('failed')
  expect(report.results[0]!.reason).toContain(failure === 'page' ? 'newPage failed' : 'close failed')
  expect(close).toHaveBeenCalledTimes(1)
  expect(browser.close).not.toHaveBeenCalled()
  expect(JSON.parse(await readFile(path.join(directory, 'native-media', 'measurements.json'), 'utf8')).error).toBeTruthy()
  expect(mocks.persist).toHaveBeenCalledTimes(1)
})

it('PNG解码失败保留原始sidecar和重放错误，不能丢失失败报告', async () => {
  mocks.badPng = true
  const { report, directory, close } = await run()
  expect(report.results[0]!.status).toBe('failed')
  expect(report.results[0]!.reason).toContain('原始证据复读失败')
  expect(JSON.parse(await readFile(path.join(directory, 'native-media', 'replay-error.json'), 'utf8')).error).toContain('原始证据复读失败')
  expect(close).toHaveBeenCalledTimes(1)
  expect(mocks.persist.mock.calls[0]![1] as CapabilityReport).toBe(report)
})

it('Firefox/WebKit不创建CDP或context，不返回空成功', async () => {
  const { browser, context } = await setup()
  for (const engine of ['firefox', 'webkit'] as const) {
    await expect(runNativeMediaWeb(context, engine, browser as unknown as Browser)).rejects.toThrow(/没有匹配/)
  }
  expect(browser.newContext).not.toHaveBeenCalled()
  expect(nativeMediaProbe.engines).toEqual(['chromium'])
})
