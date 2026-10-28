import type { RunContext } from './tailwind-capabilities/context'
import type { CaseContract } from './tailwind-capabilities/types'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { filesystemObservedAt } from './tailwind-capabilities/artifact-clock'
import { runAuthoring } from './tailwind-capabilities/authoring'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), fixture: vi.fn(), reference: vi.fn(), persist: vi.fn() }))
const reference = '.p-4{padding:1rem}.w-\\[123px\\]{width:123px}'
vi.mock('./tailwind-capabilities/fixture', () => ({
  withGeneratorFixture: async (root: string, css: string, files: Record<string, string>, run: (generator: unknown) => Promise<void>) => {
    mocks.fixture(root, css, files)
    return run({ generate: mocks.generate })
  },
}))
vi.mock('./tailwind-capabilities/reference', () => ({ defaultReferenceBuilder: async () => mocks.reference }))
vi.mock('./tailwind-capabilities/context', () => ({
  newReport: async (context: RunContext, target: string, _contracts: CaseContract[], _fixture: unknown, environment: Record<string, string | number | boolean>) => {
    await mkdir(context.directory, { recursive: true })
    const hash = 'a'.repeat(64)
    return { schemaVersion: 2, runId: context.runId, target, observedAt: context.artifactStartedAt ?? filesystemObservedAt(context.directory), identity: { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.3.3' } }, environment, results: [], artifacts: [] }
  },
  persistReport: mocks.persist,
}))
const directories: string[] = []
beforeEach(() => {
  vi.clearAllMocks()
  mocks.reference.mockResolvedValue(reference)
  mocks.generate.mockResolvedValue({ rawCss: '', css: '', classSet: new Set(['p-4', 'w-[123px]']) })
})
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})
async function run() {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-authoring-scan-'))
  directories.push(directory)
  return { report: await runAuthoring({ root: directory, directory, runId: 'scan-test', caseFilter: /^scan-html-literal$/ }), directory }
}

describe('authoring 的真实源码扫描入口', () => {
  it('即使 classSet 有全部候选，空 CSS 仍失败且不会把参考候选注入生成器', async () => {
    const { report, directory } = await run()
    expect(report.results).toMatchObject([{ id: 'scan-html-literal', status: 'failed' }])
    expect(mocks.generate).toHaveBeenCalledExactlyOnceWith({ target: 'web', candidates: [], scanSources: true })
    expect(mocks.reference).toHaveBeenCalledExactlyOnceWith(['p-4', 'w-[123px]'])
    expect(mocks.fixture).toHaveBeenCalledWith(directory, expect.not.stringContaining('@source inline'), { 'probe.html': '<div class="p-4 w-[123px]"></div>' })
    expect(await readFile(path.join(directory, 'scan-html-literal.reference.css'), 'utf8')).toBe(reference)
    expect(report.results[0]!.artifacts).toContain('scan-html-literal.raw.css')
  })

  it('完整参考输出才可通过，损失一个声明必须失败', async () => {
    mocks.generate.mockResolvedValue({ rawCss: reference, css: reference, classSet: new Set(['p-4', 'w-[123px]']) })
    expect((await run()).report.results[0]!.status).toBe('passed')
    mocks.generate.mockResolvedValue({ rawCss: '.p-4{padding:1rem}', css: '.p-4{padding:1rem}', classSet: new Set(['p-4', 'w-[123px]']) })
    expect((await run()).report.results[0]!.status).toBe('failed')
  })
})
