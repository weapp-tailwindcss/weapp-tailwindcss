import type { CaseResult, RuntimeContext } from '../scripts/demo-visual-e2e-report/types'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { miniProgramProjectStartsAtRoute, runMiniProgramCase } from '../scripts/demo-visual-e2e-report/cases'
import { closeMiniProgramAndCleanup, launchMiniProgramInCleanDevTools } from '../scripts/demo-visual-e2e-report/ide'
import { buildCases } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cases'
import { waitForOutputFilesUpdated } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations'

const state = vi.hoisted(() => ({
  marker: '',
  stop: vi.fn(async () => {}),
}))

vi.mock('../scripts/demo-visual-e2e-report/ide', () => ({
  closeMiniProgramAndCleanup: vi.fn(async () => {}),
  launchMiniProgramInCleanDevTools: vi.fn(),
}))
vi.mock('../scripts/demo-visual-e2e-report/process', () => ({ findFreePort: async () => 9420 }))
vi.mock('../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session', () => ({
  createWatchSession: async () => ({ startedAt: Date.now(), stop: state.stop, ensureRunning: () => {} }),
  sleep: async () => {},
}))
vi.mock('../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations', async importOriginal => ({
  ...await importOriginal<typeof import('../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/mutations')>(),
  waitForInitialWarmup: async () => {},
  waitForOutputsReady: async () => {},
  waitForMarkerState: async () => {},
  waitForOutputFilesUpdated: vi.fn(async (...args: unknown[]) => {
    const accept = args.at(-1) as () => Promise<boolean>
    expect(await accept()).toBe(true)
  }),
}))
vi.mock('./frameworkIdeLivePage', () => ({
  getDevToolsRelaunchTimeoutMs: () => 1000,
  readPageLiveContent: async () => state.marker,
}))
vi.mock('../scripts/demo-visual-e2e-report/mini-program-screenshot', () => ({
  captureMiniProgramViewport: async (_miniProgram: unknown, screenshot: string) => {
    await fs.mkdir(path.dirname(screenshot), { recursive: true })
    await fs.writeFile(screenshot, 'mock screenshot')
  },
  readMiniProgramWindowMetrics: async () => ({}),
}))
vi.mock('../scripts/demo-visual-e2e-report/theme-capture', () => ({ captureMiniProgramThemeEvidence: async () => ({}) }))
vi.mock('../scripts/demo-visual-e2e-report/theme', () => ({
  collectMiniProgramThemeWxmlEvidence: async () => ({}),
  collectMiniProgramThemeCssEvidence: async () => ({}),
}))

const roots: string[] = []

beforeEach(() => {
  vi.clearAllMocks()
  state.marker = ''
})

afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'visual-artifact-root-'))
  roots.push(repoRoot)
  const name = 'visual-root-fixture'
  const projectPath = path.join(repoRoot, 'demo', name)
  const miniprogramRoot = path.join(projectPath, 'output', 'mini')
  const generated = path.join(miniprogramRoot, 'chunks', 'generated.wxss')
  const shell = path.join(miniprogramRoot, 'entry.wxss')
  const pageStyle = path.join(miniprogramRoot, 'page.wxss')
  await fs.mkdir(path.dirname(generated), { recursive: true })
  await fs.writeFile(shell, '@import "/chunks/generated.wxss";')
  await fs.writeFile(pageStyle, '@import "./entry.wxss";')
  await fs.writeFile(generated, '.before { color: red; }')
  const projectConfig = JSON.stringify({ miniprogramRoot: './output/mini', setting: { compileHotReLoad: true } })
  await fs.writeFile(path.join(projectPath, 'project.config.json'), projectConfig)
  const base = buildCases(repoRoot, { includeLocalOnly: true }).find(item => item.name === 'gulp-tailwindcss-v4')!
  const watchCase = {
    ...base,
    cwd: projectPath,
    outputWxml: path.join(miniprogramRoot, 'page.wxml'),
    outputJs: path.join(miniprogramRoot, 'page.js'),
    outputStyleCandidates: [pageStyle],
    globalStyleCandidates: [shell],
  }
  await fs.writeFile(watchCase.outputWxml, '<view />')
  await fs.writeFile(watchCase.outputJs, 'Page({})')
  const page = { path: 'pages/index/index', waitFor: async () => {}, $: async () => ({ wxml: async () => '' }) }
  const miniProgram = { currentPage: async () => page }
  vi.mocked(launchMiniProgramInCleanDevTools).mockResolvedValue({ miniProgram, port: 9420 } as Awaited<ReturnType<typeof launchMiniProgramInCleanDevTools>>)
  const restore = vi.fn(async () => {})
  const item = {
    name,
    projectPath: name,
    hmr: {
      label: 'root import changes',
      watchCase,
      steps: ['first', 'second'].map(name => ({ name, marker: `${name}-marker`, classLiteral: `${name}-class`, expectedBackgroundColor: '#ffffff' })),
      mutate: async (step: { marker: string, classLiteral: string }) => {
        state.marker = step.marker
        await fs.writeFile(generated, `.${step.marker} { color: blue; }`)
        return { ...step, restore }
      },
    },
  }
  const context: RuntimeContext = { repoRoot, artifactRoot: path.join(repoRoot, 'screenshots'), timeoutMs: 1000, viewport: { width: 375, height: 667 } }
  return { item, context, projectPath, projectConfig, miniprogramRoot, generated, restore, miniProgram }
}

describe('mini-program visual artifact root', () => {
  it('reads root and relative imports throughout the real visual HMR runner', async () => {
    const { item, context, projectPath, projectConfig, restore, miniProgram } = await fixture()
    const results: CaseResult[] = []
    await runMiniProgramCase(item, context, results)
    expect(results, JSON.stringify(results)).toMatchObject([{
      status: 'passed',
      diagnostics: { outputChangedCount: 1, projectPath },
      hmrSteps: [{ name: 'first' }, { name: 'second' }],
    }])
    expect(waitForOutputFilesUpdated).toHaveBeenCalledTimes(2)
    expect(launchMiniProgramInCleanDevTools).toHaveBeenCalledWith(item.name, projectPath, 9420, 10_000)
    expect(closeMiniProgramAndCleanup).toHaveBeenCalledWith(miniProgram, projectPath)
    expect(restore).toHaveBeenCalledOnce()
    expect(state.stop).toHaveBeenCalledOnce()
    expect(await fs.readFile(path.join(projectPath, 'project.config.json'), 'utf8')).toBe(projectConfig)
  })

  it('reads the startup route from the configured runtime root', async () => {
    const { projectPath, miniprogramRoot } = await fixture()
    await fs.writeFile(path.join(projectPath, 'app.json'), JSON.stringify({ pages: ['wrong/page'] }))
    await fs.writeFile(path.join(miniprogramRoot, 'app.json'), JSON.stringify({ pages: ['pages/index/index'] }))
    expect(await miniProgramProjectStartsAtRoute(projectPath, '/pages/index/index')).toBe(true)
    expect(await miniProgramProjectStartsAtRoute(projectPath, '/wrong/page')).toBe(false)
  })

  it.each(['missing', 'outside'])('fails and releases the session for a %s imported asset', async (mode) => {
    const { item, context, projectPath, generated, restore } = await fixture()
    if (mode === 'missing') {
      await fs.rm(generated)
    }
    else {
      await fs.writeFile(generated, '@import "../../../outside.wxss";')
      await fs.writeFile(path.join(projectPath, 'outside.wxss'), '.must-not-read {}')
    }
    const results: CaseResult[] = []
    await runMiniProgramCase(item, context, results)
    expect(results).toMatchObject([{ status: 'failed', error: expect.stringContaining(mode === 'missing' ? 'ENOENT' : 'escapes mini-program output root') }])
    expect(closeMiniProgramAndCleanup).toHaveBeenCalledOnce()
    expect(state.stop).toHaveBeenCalledOnce()
    expect(restore).not.toHaveBeenCalled()
  })
})
