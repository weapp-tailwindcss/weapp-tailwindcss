import type { CapabilityIdentity, CapabilityReport, CaseContract } from './tailwind-capabilities/types'
import { Buffer } from 'node:buffer'
import { mkdtemp, readdir, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { filesystemObservedAt } from './tailwind-capabilities/artifact-clock'
import { persistReport } from './tailwind-capabilities/context'
import { capabilityCoverageEvidence, createTailwindCoverageCells, writeCapabilityCoverage } from './tailwind-capabilities/coverage'
import { jsonArray, jsonChunks, writeJsonFile } from './tailwind-capabilities/json'
import { receipt, validateCapabilityReport } from './tailwind-capabilities/report'

const directories: string[] = []
afterEach(async () => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })))
})

const hash = 'a'.repeat(64)
const identity: CapabilityIdentity = { sourceHash: hash, lockfileHash: hash, catalogHash: hash, fixtureHash: hash, expectationsHash: hash, versions: { tailwindcss: '4.test' } }

async function fixture(count = 1) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'tailwind-persistence-'))
  directories.push(root)
  const contracts: CaseContract[] = Array.from({ length: count }, (_, index) => ({ id: `case-${index}`, candidate: 'flex', features: ['display'], fixture: 'independent-view', expectation: { support: 'supported', stage: 'generation' }, requiredAssertions: ['display'], expectedValues: { display: 'flex' } }))
  const observedAt = filesystemObservedAt(root)
  const file = path.join(root, 'shared.css')
  await writeFile(file, '.flex { display: flex }')
  const artifact = await receipt(file, root, 'run', contracts.map(item => item.id), 'css')
  const report: CapabilityReport = { schemaVersion: 2, runId: 'run', target: 'static', observedAt, identity, environment: { mode: 'bounded-regression' }, artifacts: [artifact], results: contracts.map(contract => ({ id: contract.id, status: 'passed', support: 'supported', assertions: [{ name: 'display', stage: 'generation', actual: 'flex', expected: 'flex' }], artifacts: [artifact.path], warnings: [] })) }
  const options = { expected: identity, runId: report.runId, target: report.target, repositoryRoot: root, artifactRoot: root }
  return { root, report, contracts, options }
}

describe('有界 JSON 持久化', () => {
  it('分块后保持 JSON 值、Unicode、转义和数组空值的原始语义', () => {
    const value = { text: `${'中😀\\"\n'.repeat(2000)}\uD800`, removed: undefined, at: new Date('2026-10-19T00:00:00Z'), array: [undefined, null, Number.NaN, false] }
    const chunks = [...jsonChunks(value, 97)]
    expect(chunks.every(chunk => chunk.length <= 97)).toBe(true)
    expect(chunks.join('')).toBe(`${JSON.stringify(value)}\n`)
  })

  it('只枚举一次延迟数组，并且每次写入都有上界', async () => {
    const { root } = await fixture()
    let visited = 0
    function* values() {
      for (let index = 0; index < 4096; index++) {
        visited++
        yield { index, payload: '😀中文'.repeat(32) }
      }
    }
    const file = path.join(root, 'lazy.json')
    await writeJsonFile(file, { records: jsonArray(values()) }, 257)
    const stored = JSON.parse(await readFile(file, 'utf8'))
    expect(visited).toBe(4096)
    expect(stored.records).toHaveLength(4096)
    expect(stored.records[4095]).toEqual({ index: 4095, payload: '😀中文'.repeat(32) })
  })

  it('序列化失败不替换已发布文件，并清理自己的临时文件', async () => {
    const { root } = await fixture()
    const file = path.join(root, 'existing.json')
    await writeFile(file, '{"previous":true}\n')
    const circular: Record<string, unknown> = {}
    circular.self = circular
    await expect(writeJsonFile(file, circular, 2)).rejects.toThrow(/circular/)
    expect(await readFile(file, 'utf8')).toBe('{"previous":true}\n')
    expect((await readdir(root)).some(name => name.endsWith('.tmp'))).toBe(false)
  })
})

describe('大规模覆盖证据索引', () => {
  it.each(['coverage', 'report'] as const)('Date 超前时 %s 持久化接受本轮产物，仍拒绝旧证据', async (kind) => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.now() + 60_000)
    const { root, report, contracts, options } = await fixture()
    const persist = () => kind === 'coverage'
      ? writeCapabilityCoverage(path.join(root, 'coverage.json'), report, contracts, options)
      : persistReport({ root, directory: root, runId: report.runId }, report, contracts)
    await expect(persist()).resolves.toBeUndefined()
    const coverage = JSON.parse(await readFile(path.join(root, 'coverage.json'), 'utf8'))
    expect(coverage.evidence).toMatchObject([{ status: 'passed' }])
    const old = new Date(Date.parse(report.observedAt) - 60_000)
    await utimes(path.join(root, 'shared.css'), old, old)
    await expect(persist()).rejects.toThrow('早于本轮')
  })

  it('共享产物归属和结果查找的读取次数随案例数线性增长', async () => {
    const { root, report, contracts, options } = await fixture(2048)
    let idsRead = 0
    let ownersRead = 0
    report.results = report.results.map((result) => {
      const id = result.id
      return {
        ...result,
        get id() {
          idsRead++
          return id
        },
      }
    })
    report.artifacts[0]!.caseIds = new Proxy(report.artifacts[0]!.caseIds, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) {
          ownersRead++
        }
        return Reflect.get(target, key, receiver)
      },
    })
    for (let index = 1; index < 64; index++) {
      const file = path.join(root, `unrelated-${index}.css`)
      await writeFile(file, '.unrelated {}')
      report.artifacts.push({ ...await receipt(file, root, 'run', report.artifacts[0]!.caseIds, 'css') })
    }
    let artifactPathsRead = 0
    report.artifacts = report.artifacts.map((artifact) => {
      const file = artifact.path
      return {
        ...artifact,
        get path() {
          artifactPathsRead++
          return file
        },
      }
    })
    const evidence = await capabilityCoverageEvidence(report, contracts, options)
    expect(evidence).toHaveLength(2048)
    expect(evidence.every(item => item.status === 'passed' && item.artifactManifest?.length === 1)).toBe(true)
    expect(idsRead).toBeLessThan(2048 * 20)
    expect(ownersRead).toBeLessThan(2048 * 3)
    expect(artifactPathsRead).toBeLessThan(2048 * 10)
  })

  it('产物引用去重后仍按原回执顺序保留每个文件及准确归属', async () => {
    const { root, report, contracts, options } = await fixture(2)
    const second = path.join(root, 'second.css')
    await writeFile(second, '.second {}')
    report.artifacts.push(await receipt(second, root, 'run', [contracts[0]!.id], 'css'))
    report.results[0]!.artifacts = ['second.css', 'shared.css', 'second.css']
    const evidence = await capabilityCoverageEvidence(report, contracts, options)
    expect(evidence[0]!.artifactManifest?.map(item => item.path)).toEqual(['shared.css', 'second.css'])
    expect(evidence[1]!.artifactManifest?.map(item => item.path)).toEqual(['shared.css'])
    report.results[1]!.artifacts.push('second.css')
    expect(() => validateCapabilityReport(report, contracts, identity, 'run', 'static')).toThrow(/不属于本案例/)
  })

  it('流式 coverage 与完整 v2 的逐例字段完全一致，紧凑输出降低磁盘体积', async () => {
    const { root, report, contracts, options } = await fixture(128)
    const expected = { schemaVersion: 2, runId: report.runId, registry: createTailwindCoverageCells(report.target, contracts), evidence: await capabilityCoverageEvidence(report, contracts, options) }
    const file = path.join(root, 'coverage.json')
    await writeCapabilityCoverage(file, report, contracts, options)
    const source = await readFile(file, 'utf8')
    expect(JSON.parse(source)).toEqual(expected)
    expect(Buffer.byteLength(source)).toBeLessThan(Buffer.byteLength(JSON.stringify(expected, null, 2)) * 0.8)
    expect(JSON.parse(source).registry).toHaveLength(128)
    expect(JSON.parse(source).evidence).toHaveLength(128)
  })

  it('完整持久化不再请求拼接大型容器，同时保存全部结果、合同和层级证据', async () => {
    const { root, report, contracts } = await fixture(512)
    const stringify = JSON.stringify
    vi.spyOn(JSON, 'stringify').mockImplementation(((value: unknown, ...args: unknown[]) => {
      if ((Array.isArray(value) && value.length > 64) || (value && typeof value === 'object' && ('results' in value || 'registry' in value))) {
        throw new RangeError('Invalid string length')
      }
      return Reflect.apply(stringify, JSON, [value, ...args])
    }) as typeof JSON.stringify)
    await persistReport({ root, directory: root, runId: 'run' }, report, contracts)
    const storedReport = JSON.parse(await readFile(path.join(root, 'report.json'), 'utf8'))
    const storedContracts = JSON.parse(await readFile(path.join(root, 'contracts.json'), 'utf8'))
    const storedCoverage = JSON.parse(await readFile(path.join(root, 'coverage.json'), 'utf8'))
    expect(storedReport).toEqual(report)
    expect(storedContracts).toEqual(contracts)
    expect(storedCoverage.registry).toHaveLength(512)
    expect(storedCoverage.evidence).toHaveLength(512)
    expect(storedCoverage.evidence.every((item: { status: string }) => item.status === 'passed')).toBe(true)
  })
})
