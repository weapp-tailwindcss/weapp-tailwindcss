import fsSync from 'node:fs'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { persistCompilationEvidence } from '../scripts/diagnostics/capture.mjs'
import { limits } from '../scripts/diagnostics/constants.mjs'
import { createEvidenceWriter, sha256 } from '../scripts/diagnostics/evidence.mjs'
import { allocationMappingScope, annotateAllocationFrames } from '../scripts/diagnostics/frames.mjs'

const roots = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allocation-mapping-'))
  roots.push(root)
  const sessionDirectory = path.join(root, 'diagnostic')
  await fs.mkdir(sessionDirectory)
  return { root, sessionDirectory }
}

const frame = (id, url, children = []) => ({ id, selfSize: 1, callFrame: { functionName: 'allocate', url, lineNumber: 0, columnNumber: 0 }, children })

describe('分配归因只读取准备副本内的仓库模块', () => {
  it.each([
    ['/repo/packages/main.js', '/repo', 'linux', 'prepared-repository'],
    ['/packages/main.js', '/', 'linux', 'prepared-repository'],
    ['/repo/node_modules/pkg/index.js', '/repo', 'linux', 'third-party-dependency'],
    ['/repo/packages/a/node_modules/pkg/index.js', '/repo', 'linux', 'third-party-dependency'],
    ['/repo-other/a.js', '/repo', 'linux', 'outside-prepared-root'],
    ['relative/a.js', '/repo', 'linux', 'outside-prepared-root'],
    ['C:\\Repo\\packages\\main.js', 'c:/repo', 'win32', 'prepared-repository'],
    ['C:\\Repo\\NODE_MODULES\\pkg\\index.js', 'c:/repo', 'win32', 'third-party-dependency'],
    ['D:\\repo\\main.js', 'C:\\repo', 'win32', 'outside-prepared-root'],
    ['\\\\server\\share\\repo\\a.js', '\\\\server\\share\\repo', 'win32', 'prepared-repository'],
  ])('按路径边界区分映射范围：%s', (file, root, platform, expected) => {
    expect(allocationMappingScope(file, root, platform)).toBe(expected)
  })

  it('超过 128 个第三方帧和零分配祖先仍完整保留，不读取依赖源码或占用仓库映射限额', async () => {
    const identity = await fixture()
    const file = path.join(identity.root, 'repository.js')
    await fs.writeFile(file, 'function allocate() {}')
    await fs.writeFile(`${file}.map`, JSON.stringify({ version: 3, names: [], sources: ['source.ts'], mappings: 'AAAA' }))
    const dependencies = Array.from({ length: limits.maxMappingFiles + 1 }, (_, i) => frame(i + 2, path.join(identity.root, 'node_modules', `package-${i}`, 'index.js')))
    const outside = path.join(path.dirname(identity.root), 'outside-dependency.js')
    const profile = { head: { ...frame(1, '', [...dependencies, frame(200, outside), frame(201, pathToFileURL(file).href)]), selfSize: 0 } }
    const original = structuredClone(profile)
    const read = vi.spyOn(fsSync, 'readFileSync')
    const frames = annotateAllocationFrames(profile, identity)
    expect(profile).toEqual(original)
    expect(frames).toHaveLength(dependencies.length + 3)
    expect(frames.filter(item => item.mappingScope === 'third-party-dependency')).toHaveLength(dependencies.length)
    expect(frames.find(item => item.nodeId === 200)).toMatchObject({ originalUrl: outside, mappingScope: 'outside-prepared-root', comparableAcrossBuilds: false })
    expect(frames.find(item => item.nodeId === 201)).toMatchObject({ attribution: 'source-map', sourceKey: '<root>/source.ts' })
    expect(read.mock.calls.map(([target]) => target)).toEqual([await fs.realpath(file), await fs.realpath(`${file}.map`)])
  })

  it('准备副本的真实路径与符号链接入口都归属同一仓库，观测帧仍独立标记', async () => {
    const identity = await fixture()
    const alias = path.join(identity.root, 'alias')
    const target = path.join(identity.root, 'prepared')
    const diagnostic = path.join(target, 'diagnostic')
    await fs.mkdir(diagnostic, { recursive: true })
    await fs.symlink(target, alias, 'junction')
    const file = path.join(target, 'repository.js')
    await fs.writeFile(file, 'function allocate() {}')
    await fs.writeFile(`${file}.map`, JSON.stringify({ version: 3, names: [], sources: ['source.ts'], mappings: 'AAAA' }))
    const frames = annotateAllocationFrames({ head: frame(1, await fs.realpath(file), [frame(2, path.join(await fs.realpath(diagnostic), 'capture.mjs'))]) }, { root: alias, sessionDirectory: path.join(alias, 'diagnostic') })
    expect(frames[0]).toMatchObject({ moduleKey: '<root>/repository.js', mappingScope: 'prepared-repository', attribution: 'source-map', sourceKey: '<root>/source.ts' })
    expect(frames[1]).toMatchObject({ diagnosticAllocation: true, attribution: 'diagnostic-observer' })
  })

  it('仓库内指向依赖目录的符号链接不能绕过读取边界', async () => {
    const identity = await fixture()
    const dependency = path.join(identity.root, 'node_modules', 'dependency')
    await fs.mkdir(dependency, { recursive: true })
    await fs.writeFile(path.join(dependency, 'index.js'), 'external source')
    const linked = path.join(identity.root, 'linked')
    await fs.symlink(dependency, linked, 'junction')
    const file = path.join(linked, 'index.js')
    const read = vi.spyOn(fsSync, 'readFileSync')
    const frames = annotateAllocationFrames({ head: frame(1, file, [frame(2, file)]) }, identity)
    expect(frames).toHaveLength(2)
    for (const record of frames) {
      expect(record).toMatchObject({ mappingScope: 'third-party-dependency', attribution: 'unmapped-module', comparableAcrossBuilds: false })
    }
    expect(read).not.toHaveBeenCalled()
  })

  it('仓库模块仍受原 128 个文件上限约束；失败前保存原始 profile、来源和候选', async () => {
    const identity = await fixture()
    const modules = Array.from({ length: limits.maxMappingFiles + 1 }, (_, i) => path.join(identity.root, `repository-${i}.js`))
    await Promise.all(modules.map(file => fs.writeFile(file, 'function allocate() {}')))
    const profile = { head: frame(1, '', modules.map((file, i) => frame(i + 2, file))), samples: [{ nodeId: 2, size: 100, ordinal: 1 }] }
    const sampling = { profile, parameters: { samplingInterval: limits.samplingInterval } }
    const key = path.join(identity.root, 'source.vue')
    const store = { snapshot: () => ({ candidatesById: [[key, ['flex']]], sourceById: [[key, '中文 flex']] }), values: () => new Set(['flex']), getRevision: () => 1 }
    const writer = createEvidenceWriter(identity.sessionDirectory)
    expect(() => persistCompilationEvidence({ identity, phase: { type: 'build-start' }, index: 1, sampling, stores: new Map([[1, new WeakRef(store)]]), collections: { runtime: store.values() }, writer, started: performance.now() })).toThrow('栈映射模块数超过诊断上限')
    const raw = await fs.readFile(path.join(identity.sessionDirectory, 'allocation-1.json'))
    expect(JSON.parse(raw).sampling.profile).toEqual(profile)
    const inputs = JSON.parse(await fs.readFile(path.join(identity.sessionDirectory, 'inputs-1.json'), 'utf8'))
    expect(inputs.compilationCandidates.runtime).toEqual(['flex'])
    expect(inputs.sources[0].maps.sourceById[0]).toMatchObject({ sha256: sha256('中文 flex') })
    expect(inputs.profileReceipt.sha256).toBe(sha256(raw))
    expect(await fs.readdir(identity.sessionDirectory)).toEqual(['allocation-1.json', 'inputs-1.json'])
    expect(writer.accounting().filesWritten).toBe(2)
    expect(limits.maxMappingFiles).toBe(128)
    expect(limits.maxMappingBytes).toBe(32 * 1024 * 1024)
  })
})
