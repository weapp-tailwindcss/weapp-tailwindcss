import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { allocationProject, diagnosticMutationMarker, limits, validateAllocationRequest } from '../scripts/diagnostics/constants.mjs'
import { candidateEvidence, compilationCandidates, createEvidenceWriter, rootRelativeKey, sha256 } from '../scripts/diagnostics/evidence.mjs'
import { annotateAllocationFrames } from '../scripts/diagnostics/frames.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('分配诊断输入和正式门禁隔离', () => {
  it('诊断两侧使用相同轮次标记，不读时钟，初始内容碰撞或额外轮次直接失败', () => {
    const original = '<view class="flex">原文</view>'
    const baseline = [1, 2, 3].map(round => diagnosticMutationMarker(round, original))
    const current = [1, 2, 3].map(round => diagnosticMutationMarker(round, original))
    expect(current).toEqual(baseline)
    expect(new Set(current).size).toBe(3)
    expect(() => diagnosticMutationMarker(1, `${original}${baseline[0]}`)).toThrow('碰撞')
    expect(() => diagnosticMutationMarker(4, original)).toThrow('固定三轮')
  })

  const valid = { enabled: true, guardMode: false, baselineRef: 'a'.repeat(40), selectedProjects: [{ key: allocationProject }], buildRuns: 3, hmrRuns: 3 }
  it('仅接受已登记项目与完整基线，拒绝正式 guard、缩短或扩大工作负载', () => {
    expect(() => validateAllocationRequest(valid)).not.toThrow()
    for (const patch of [{ guardMode: true }, { baselineRef: 'main' }, { hmrRuns: 2 }, { hmrRuns: 4 }, { buildRuns: 1 }, { selectedProjects: [] }, { selectedProjects: [{ key: 'other' }] }]) {
      expect(() => validateAllocationRequest({ ...valid, ...patch })).toThrow()
    }
    expect(() => validateAllocationRequest({ enabled: false })).not.toThrow()
  })

  it.each([
    ['/work/base/src/a.vue?vue&type=style', '/work/base', 'linux', '<root>/src/a.vue?vue&type=style'],
    ['/src/a.vue', '/', 'linux', '<root>/src/a.vue'],
    ['/work/baseball/a.vue', '/work/base', 'linux', '/work/baseball/a.vue'],
    ['relative/a.vue', '/work/base', 'linux', 'relative/a.vue'],
    ['C:\\Repo Space\\base\\src\\a.vue?raw', 'c:/repo space/base', 'win32', '<root>/src/a.vue?raw'],
    ['D:\\base\\a.vue', 'C:\\base', 'win32', 'D:\\base\\a.vue'],
    ['file:///C:/Repo%20Space/base/a.vue', 'C:\\Repo Space\\base', 'win32', '<root>/a.vue'],
    ['\\\\server\\share\\base\\a.vue', '\\\\server\\share\\base', 'win32', '<root>/a.vue'],
  ])('来源身份仅映射已知根，保留查询、盘符及原始值：%s', (value, root, platform, expected) => {
    expect(rootRelativeKey(value, root, platform)).toBe(expected)
  })

  it('完整保留不同来源层和候选，哈希按实际 UTF-8，观测不改写 store', () => {
    const snapshot = { candidatesById: [['/base/a.vue', ['z', 'flex']]], scanSourceById: [['/base/a.vue', '中文 flex']], inlineIncludedCandidates: ['grid'], inlineExcludedCandidates: ['hidden'] }
    const before = structuredClone(snapshot)
    const store = { snapshot: () => snapshot, values: () => new Set(['grid', 'flex', 'z']), getRevision: () => 7 }
    const evidence = candidateEvidence(store, '/base')
    expect(evidence.candidates).toEqual(['flex', 'grid', 'z'])
    expect(evidence.maps.scanSourceById).toEqual([{ key: '/base/a.vue', comparableKey: '<root>/a.vue', sha256: sha256(Buffer.from('中文 flex')), utf8Bytes: 11, utf16Length: 7 }])
    expect(snapshot).toEqual(before)
    expect(compilationCandidates({ runtime: new Set(['grid', 'flex']) })).toEqual({ runtime: ['flex', 'grid'] })
  })

  it('候选和文件超限明确失败，不输出截断后看似完整的证据', async () => {
    expect(() => compilationCandidates({ runtime: Array.from({ length: limits.maxCandidates + 1 }, (_, i) => `${i}`) })).toThrow('超过')
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allocation-evidence-'))
    roots.push(root)
    const writer = createEvidenceWriter(root)
    expect(() => writer.write('too-large.json', { body: 'large' }, 1)).toThrow('上限')
    expect(await fs.readdir(root)).toEqual([])
    expect(() => writer.write('../escape.json', {})).toThrow('文件名')
    const receipt = writer.write('complete.json', { complete: true })
    expect(receipt.sha256).toBe(sha256(await fs.readFile(path.join(root, 'complete.json'))))
  })

  it('没有 source map 的构建 hash 不作函数差异证据，诊断调用的子栈也标记观测分配', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allocation-frames-'))
    roots.push(root)
    const diagnostic = path.join(root, 'diagnostic')
    await fs.mkdir(diagnostic)
    const file = path.join(root, 'chunk-ABC123.js')
    await fs.writeFile(file, 'function transform() {}')
    const frame = (id, url, children = []) => ({ id, selfSize: 1, callFrame: { functionName: 'transform', url, lineNumber: 0, columnNumber: 0 }, children })
    const profile = { head: frame(1, '', [frame(2, file), frame(3, path.join(diagnostic, 'evidence.mjs'), [frame(4, file)])]) }
    const frames = annotateAllocationFrames(profile, { root, sessionDirectory: diagnostic })
    expect(frames.find(item => item.nodeId === 2)).toMatchObject({ attribution: 'unmapped-module', comparableAcrossBuilds: false, moduleKey: '<root>/chunk-ABC123.js' })
    expect(frames.find(item => item.nodeId === 4)).toMatchObject({ diagnosticAllocation: true, attribution: 'diagnostic-observer' })
  })

  it('源码映射还原工程来源；同文件读取错误保持不可比较，超过读取上限整份失败', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allocation-source-map-'))
    roots.push(root)
    const file = path.join(root, 'chunk-123.js')
    await fs.writeFile(file, 'function transform() {}\n')
    await fs.writeFile(`${file}.map`, JSON.stringify({ version: 3, file: path.basename(file), names: [], sources: ['source.ts'], sourcesContent: ['export function transform() {}'], mappings: 'AAAA' }))
    const frame = (id, url, children = []) => ({ id, selfSize: 1, callFrame: { functionName: 'transform', url, lineNumber: 0, columnNumber: 0 }, children })
    const missing = path.join(root, 'missing.js')
    const frames = annotateAllocationFrames({ head: frame(1, '', [frame(2, file), frame(3, missing), frame(4, missing)]) }, { root, sessionDirectory: path.join(root, 'diagnostic') })
    expect(frames.find(item => item.nodeId === 2)).toMatchObject({ attribution: 'source-map', sourceKey: '<root>/source.ts', sourceLine: 0, sourceColumn: 0 })
    for (const id of [3, 4]) {
      expect(frames.find(item => item.nodeId === id)).toMatchObject({ attribution: 'unavailable', comparableAcrossBuilds: false })
    }
    const large = await fs.open(file, 'w')
    try {
      await large.truncate(limits.maxProfileBytes + 1)
    }
    finally {
      await large.close()
    }
    expect(() => annotateAllocationFrames({ head: frame(1, file) }, { root, sessionDirectory: path.join(root, 'diagnostic') })).toThrow('读取上限')
  })
})
