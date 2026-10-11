import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildBundleSnapshotForBuild } from '@/bundlers/vite/bundle-state'
import { collectBundleMarkupCandidates } from '@/bundlers/vite/generate-bundle/bundle-markup-candidates'
import { createCache } from '@/cache'
import { extractCandidatesFromSource } from '@/tailwindcss/candidates'
import * as sourceScan from '@/tailwindcss/source-scan'
import { createRollupAsset } from './vite-plugin.testkit'

const fixtureRoot = fileURLToPath(new URL('../fixtures/wxml/', import.meta.url))

function collect(previousCandidatesByFile: Map<string, { sourceFile: string, candidates: Set<string> }>, removedFiles: string[] = []) {
  const rootDir = fixtureRoot
  const snapshot = buildBundleSnapshotForBuild({}, {
    cache: createCache(),
    cssMatcher: () => false,
    htmlMatcher: () => false,
    jsMatcher: () => false,
    wxsMatcher: () => false,
  } as any, path.join(rootDir, 'dist'))
  for (const file of removedFiles) {
    snapshot.removedFiles.add(file)
  }
  return collectBundleMarkupCandidates({
    previousCandidatesByFile,
    preserveMissingFiles: true,
    resolveSourceCandidateFile: () => undefined,
    rootDir,
    snapshot,
    transformFilter: undefined,
  })
}

afterEach(() => vi.restoreAllMocks())

describe('Vite bundle markup 查询复用', () => {
  it('对真实模板候选的等价查询只执行一次来源匹配', async () => {
    const previousCandidatesByFile = new Map<string, { sourceFile: string, candidates: Set<string> }>()
    for (const name of ['class-case.wxml', 'weapp-vite-case0.wxml']) {
      const sourceFile = path.join(fixtureRoot, name)
      const source = await readFile(sourceFile, 'utf8')
      previousCandidatesByFile.set(name, { sourceFile, candidates: await extractCandidatesFromSource(source, 'wxml') })
    }
    const collection = await collect(previousCandidatesByFile)
    const match = vi.spyOn(sourceScan, 'isFileMatchedByTailwindSourceEntries')
    const entries: TailwindSourceEntry[] = [{ base: fixtureRoot, pattern: '*.wxml', negated: false }]
    const first = collection.valuesForEntries(entries)
    expect(first.size).toBeGreaterThan(0)
    expect(first).toEqual(collection.values)
    const calls = match.mock.calls.length
    expect(calls).toBe(2)
    const second = collection.valuesForEntries(entries.map(entry => ({ ...entry })))
    expect(second).toEqual(first)
    expect(second).not.toBe(first)
    expect(match).toHaveBeenCalledTimes(calls)
  })

  it.each([
    ['POSIX', path.posix, '/project'],
    ['POSIX root', path.posix, '/'],
    ['Windows', path.win32, String.raw`C:\workspace`],
    ['Windows root', path.win32, 'D:\\'],
    ['UNC', path.win32, String.raw`\\server\share`],
    ['relative', path, path.join('fixtures', 'project')],
  ] as const)('为 %s 路径保留正向、否定和显式排除匹配', async (_name, pathApi, base) => {
    const collection = await collect(new Map([
      ['card.wxml', { sourceFile: pathApi.join(base, 'components', 'card.uvue'), candidates: new Set(['p-4']) }],
      ['other.wxml', { sourceFile: pathApi.join(base, 'other', 'card.uvue'), candidates: new Set(['m-8']) }],
    ]))
    const entries: TailwindSourceEntry[] = [
      { base, pattern: '**/*.uvue', negated: false },
      { base, pattern: 'other/**', negated: true },
    ]
    const match = vi.spyOn(sourceScan, 'isFileMatchedByTailwindSourceEntries')
    expect(collection.valuesForEntries(entries)).toEqual(new Set(['p-4']))
    const calls = match.mock.calls.length
    expect(collection.valuesForEntries(entries.map(entry => ({ ...entry })))).toEqual(new Set(['p-4']))
    expect(match).toHaveBeenCalledTimes(calls)
    expect(collection.valuesForEntries([])).toEqual(new Set())
    expect(collection.valuesForEntries(undefined)).toEqual(new Set(['p-4', 'm-8']))
    expect(collection.valuesForEntries(undefined, { excludeEntries: [entries[1]!] })).toEqual(new Set(['m-8']))
    entries[1]!.pattern = 'components/**'
    expect(collection.valuesForEntries(entries)).toEqual(new Set(['m-8']))
    const excludeEntries: TailwindSourceEntry[] = [{ base, pattern: 'other/**', negated: false }]
    expect(collection.valuesForEntries(undefined, { excludeEntries })).toEqual(new Set(['p-4']))
    excludeEntries[0]!.pattern = 'components/**'
    expect(collection.valuesForEntries(undefined, { excludeEntries })).toEqual(new Set(['m-8']))
  })

  it('封存查询输入并隔离返回集合与交接状态的修改', async () => {
    const sourceFile = path.join(fixtureRoot, 'card.wxml')
    const collection = await collect(new Map([
      ['card.wxml', { sourceFile, candidates: new Set(['p-4']) }],
    ]))
    const entries: TailwindSourceEntry[] = [{ base: fixtureRoot, pattern: '*.wxml', negated: false }]
    const first = collection.valuesForEntries(entries)
    first.clear()
    first.add('query-pollution')
    collection.values.add('values-pollution')
    const entry = collection.candidatesByFile.get('card.wxml')!
    entry.candidates.clear()
    entry.candidates.add('next-build')
    entry.sourceFile = path.join(fixtureRoot, 'moved.wxml')
    collection.candidatesByFile.set('other.wxml', { sourceFile, candidates: new Set(['other-build']) })

    expect(collection.valuesForEntries(entries)).toEqual(new Set(['p-4']))
    expect(collection.valuesForEntries([{ ...entries[0]!, pattern: 'card.wxml' }])).toEqual(new Set(['p-4']))
    expect(collection.valuesForEntries(undefined)).toEqual(new Set(['p-4']))
    const next = await collect(collection.candidatesByFile)
    expect(next.valuesForEntries(entries)).toEqual(new Set(['next-build', 'other-build']))
    const removed = await collect(next.candidatesByFile, ['card.wxml'])
    expect(removed.valuesForEntries(entries)).toEqual(new Set(['other-build']))
    collection.candidatesByFile.clear()
    expect(collection.valuesForEntries(entries)).toEqual(new Set(['p-4']))
  })

  it('提取器持有的候选集合不能修改封存后的查询', async () => {
    const extracted = new Set(['p-4'])
    const file = 'card.wxml'
    const snapshot = buildBundleSnapshotForBuild({
      [file]: { ...createRollupAsset('<view class="p-4" />'), fileName: file },
    }, {
      cache: createCache(),
      cssMatcher: () => false,
      htmlMatcher: () => true,
      jsMatcher: () => false,
      wxsMatcher: () => false,
    } as any, path.join(fixtureRoot, 'dist'))
    const collection = await collectBundleMarkupCandidates({
      extractSourceCandidates: async () => extracted,
      resolveSourceCandidateFile: () => path.join(fixtureRoot, file),
      rootDir: fixtureRoot,
      snapshot,
      transformFilter: undefined,
    })
    extracted.clear()
    extracted.add('external-mutation')
    expect(collection.candidatesByFile.get(file)!.candidates).toEqual(new Set(['p-4']))
    expect(collection.valuesForEntries([{ base: fixtureRoot, pattern: '*.wxml', negated: false }])).toEqual(new Set(['p-4']))
    expect(collection.valuesForEntries(undefined)).toEqual(new Set(['p-4']))
  })

  it('下一轮重新解析删除文件的父目录身份和改向的符号链接', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-markup-query-'))
    try {
      const first = path.join(root, 'first')
      const second = path.join(root, 'second')
      const alias = path.join(root, 'alias')
      await mkdir(first)
      await mkdir(second)
      await writeFile(path.join(first, 'card.uvue'), '<view />')
      await symlink(first, alias, process.platform === 'win32' ? 'junction' : 'dir')
      const collection = await collect(new Map([
        ['card.wxml', { sourceFile: path.join(alias, 'card.uvue'), candidates: new Set(['p-4']) }],
      ]))
      const entries: TailwindSourceEntry[] = [{ base: first, pattern: '*.uvue', negated: false }]
      expect(collection.valuesForEntries(entries)).toEqual(new Set(['p-4']))

      await rm(path.join(first, 'card.uvue'))
      const deleted = await collect(collection.candidatesByFile)
      expect(deleted.valuesForEntries(entries)).toEqual(new Set(['p-4']))
      await rm(alias, { recursive: true, force: true })
      await symlink(second, alias, process.platform === 'win32' ? 'junction' : 'dir')
      const redirected = await collect(deleted.candidatesByFile)
      expect(redirected.valuesForEntries(entries)).toEqual(new Set())
      expect(redirected.valuesForEntries([{ ...entries[0]!, base: second }])).toEqual(new Set(['p-4']))
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
