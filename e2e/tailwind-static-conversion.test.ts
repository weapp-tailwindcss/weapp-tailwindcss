import type { RunContext } from './tailwind-capabilities/context'
import type { CapabilityIdentity, CaseContract } from './tailwind-capabilities/types'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { conversionTargets } from './tailwind-capabilities/conversion-audit'
import { assertCapabilitySuccess } from './tailwind-capabilities/report'
import { runStatic } from './tailwind-capabilities/static'

const mocks = vi.hoisted(() => ({ generate: vi.fn(), native: vi.fn(), lynx: vi.fn(), persist: vi.fn() }))
const source = '.size-8{width:2rem;height:2rem}'

vi.mock('./tailwind-capabilities/reference', () => ({ defaultReferenceBuilder: async () => async (candidates: string[]) => candidates.map(candidate => source.replaceAll('size-8', candidate)).join('') }))
vi.mock('weapp-tailwindcss/escape', () => ({ escape: (value: string) => value }))
vi.mock('../packages/react-native/src/compiler', () => ({ compileNativeStylesheet: mocks.native }))
vi.mock('./lynx/batch-encode', () => ({ encodeLynxCss: mocks.lynx }))
vi.mock('./tailwind-capabilities/fixture', () => ({ withGeneratorFixture: async (_root: string, _css: string, _files: unknown, run: (generator: unknown) => Promise<void>) => run({ generate: mocks.generate }) }))
vi.mock('./tailwind-capabilities/inventory/value-cases', () => ({ valueCases: () => [] }))
vi.mock('./tailwind-capabilities/inventory/index', () => ({
  loadInventory: async () => ({ completions: [{ candidate: 'size-8' }, { candidate: 'size-9' }], utilities: [], variants: [] }),
  collectInventory: async () => ({}),
  validateInventory: () => {},
  loadDefaultDesignSystem: async () => ({ candidatesToCss: (candidates: string[]) => candidates.map(candidate => source.replaceAll('size-8', candidate)) }),
}))
vi.mock('./tailwind-capabilities/context', () => ({
  newReport: async (context: RunContext, target: string, _contracts: CaseContract[], _fixture: unknown, environment: Record<string, string | number | boolean>) => {
    const hash = 'a'.repeat(64)
    const identity: CapabilityIdentity = { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.3.3' } }
    return { schemaVersion: 2, runId: context.runId, target, observedAt: new Date().toISOString(), identity, environment, results: [], artifacts: [] }
  },
  persistReport: mocks.persist,
}))

const directories: string[] = []
beforeEach(() => {
  vi.clearAllMocks()
  mocks.generate.mockImplementation(async ({ target }: { target: string }) => {
    if (target === 'weapp') {
      return { css: '' }
    }
    return { rawCss: `${source}${source.replaceAll('size-8', 'size-9')}`, classSet: new Set(['size-8', 'size-9']) }
  })
  mocks.native.mockReturnValue({ rules: {}, warnings: [] })
  mocks.lynx.mockResolvedValue({ css: '', diagnostics: [] })
})
afterEach(async () => {
  for (const directory of directories.splice(0)) {
    await rm(directory, { recursive: true, force: true })
  }
})

async function execute() {
  const directory = await mkdtemp(path.join(tmpdir(), 'tailwind-static-conversion-'))
  directories.push(directory)
  const context: RunContext = { root: directory, directory, runId: 'conversion-test', caseFilter: /^completion\// }
  const report = await runStatic(context)
  return { report, directory }
}

describe('static runner 的生成与三目标转换分层', () => {
  it('三个真实转换调用全抛时生成仍通过，三目标分别失败', async () => {
    mocks.generate.mockImplementation(async ({ target }: { target: string }) => {
      if (target === 'weapp') {
        throw new Error('weapp conversion failed')
      }
      return { rawCss: `${source}${source.replaceAll('size-8', 'size-9')}`, classSet: new Set(['size-8', 'size-9']) }
    })
    mocks.native.mockImplementation(() => {
      throw new Error('native conversion failed')
    })
    mocks.lynx.mockRejectedValue(new Error('lynx conversion failed'))
    const { report } = await execute()
    expect(report.results.filter(result => result.id.startsWith('completion/')).map(result => result.status)).toEqual(['passed', 'passed'])
    expect(report.results.filter(result => result.id.startsWith('conversion/')).map(result => result.status)).toEqual(Array.from({ length: 6 }).fill('failed'))
    expect(() => assertCapabilitySuccess(report)).toThrow('6 项尚未通过')
  })

  it('空 WXSS、空 manifest、空 Lynx 不会自动成为 unsupported 或 passed', async () => {
    const { report, directory } = await execute()
    for (const candidate of ['size-8', 'size-9']) {
      for (const target of conversionTargets) {
        expect(report.results.find(result => result.id === `conversion/${target}/completion/${candidate}`)).toMatchObject({ status: 'not-run', support: 'supported' })
      }
    }
    expect(report.results.filter(result => result.id.startsWith('completion/')).every(result => result.status === 'passed')).toBe(true)
    expect(() => assertCapabilitySuccess(report)).toThrow()
    const audit = JSON.parse(await readFile(path.join(directory, 'batch-0000.audit.json'), 'utf8'))
    expect(audit[0].observations.weapp).toMatchObject({ execution: 'completed', snapshot: { statements: [] } })
    expect(await readFile(path.join(directory, 'batch-0000.wxss'), 'utf8')).toBe('\n')
    expect(mocks.persist).toHaveBeenCalledWith(expect.anything(), report, expect.arrayContaining([expect.objectContaining({ id: 'conversion/lynx/completion/size-9' })]))
  })

  it('部分转换声明和无 oracle 的完整转换同样不得通过', async () => {
    mocks.generate.mockImplementation(async ({ target }: { target: string }) => target === 'weapp'
      ? { css: '.size-8{width:2rem}.size-9{width:2rem;height:2rem}' }
      : { rawCss: `${source}${source.replaceAll('size-8', 'size-9')}`, classSet: new Set(['size-8', 'size-9']) })
    const { report } = await execute()
    expect(report.results.find(result => result.id === 'conversion/weapp/completion/size-8')?.status).toBe('not-run')
    expect(report.results.find(result => result.id === 'conversion/weapp/completion/size-9')?.status).toBe('not-run')
    expect(report.results).toHaveLength(8)
  })

  it('生成错误仍为每个候选保留三目标未执行状态', async () => {
    mocks.generate.mockRejectedValue(new Error('generation failed'))
    const { report } = await execute()
    expect(report.results).toHaveLength(8)
    expect(report.results.filter(result => result.id.startsWith('completion/')).every(result => result.status === 'failed')).toBe(true)
    expect(report.results.filter(result => result.id.startsWith('conversion/')).every(result => result.status === 'not-run')).toBe(true)
    expect(mocks.native).not.toHaveBeenCalled()
    expect(mocks.lynx).not.toHaveBeenCalled()
  })

  it('转换产物不能解析时只使对应转换失败，生成证据仍保留', async () => {
    mocks.generate.mockImplementation(async ({ target }: { target: string }) => target === 'weapp'
      ? { css: '.size-8{' }
      : { rawCss: `${source}${source.replaceAll('size-8', 'size-9')}`, classSet: new Set(['size-8', 'size-9']) })
    const { report } = await execute()
    expect(report.results.filter(result => result.id.startsWith('completion/')).every(result => result.status === 'passed')).toBe(true)
    expect(report.results.filter(result => result.id.startsWith('conversion/weapp/')).every(result => result.status === 'failed')).toBe(true)
    expect(report.results.filter(result => result.id.startsWith('conversion/lynx/')).every(result => result.status === 'not-run')).toBe(true)
  })
})
