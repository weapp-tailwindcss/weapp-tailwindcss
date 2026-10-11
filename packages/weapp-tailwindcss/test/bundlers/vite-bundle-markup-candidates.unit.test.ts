import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { buildBundleSnapshotForBuild } from '@/bundlers/vite/bundle-state'
import { collectBundleMarkupCandidates } from '@/bundlers/vite/generate-bundle/bundle-markup-candidates'
import { createTransformFilter } from '@/bundlers/vite/generate-bundle/transform-filter'
import { createCache } from '@/cache'
import { createRollupAsset } from './vite-plugin.testkit'

function createOptions() {
  return {
    cache: createCache(),
    cssMatcher: (file: string) => file.endsWith('.wxss'),
    htmlMatcher: (file: string) => file.endsWith('.wxml'),
    jsMatcher: (file: string) => file.endsWith('.js'),
    wxsMatcher: () => false,
  } as any
}

describe('bundlers/vite bundle markup candidates', () => {
  it.each(['/project/src/card.vue', 'C:\\workspace\\src\\card.vue', '\\\\server\\share\\src\\card.vue', 'src/card.vue'])('removes output ownership without losing sibling candidates for %s', async (sourceFile) => {
    const rootDir = path.resolve('/project')
    const previousCandidatesByFile = new Map([
      ['first/card.wxml', { sourceFile, candidates: new Set(['h-8']) }],
      ['second/card.wxml', { sourceFile, candidates: new Set(['h-20']) }],
    ])
    const snapshot = buildBundleSnapshotForBuild({}, createOptions(), path.join(rootDir, 'dist'))
    snapshot.removedFiles.add('first/card.wxml')
    const collection = await collectBundleMarkupCandidates({
      previousCandidatesByFile,
      preserveMissingFiles: true,
      resolveSourceCandidateFile: () => undefined,
      rootDir,
      snapshot,
      transformFilter: undefined,
    })
    expect(collection.values).toEqual(new Set(['h-20']))
    expect([...collection.candidatesByFile.keys()]).toEqual(['second/card.wxml'])
    expect(previousCandidatesByFile.size).toBe(2)
  })

  it('collects current bundle classes without mutating source candidate ownership', async () => {
    const rootDir = '/project'
    const firstSource = '<layout><view class="source-only bundle-added" /></layout>'
    const secondSource = '<view class="second-added" />'
    const snapshot = buildBundleSnapshotForBuild({
      'pages/first/index.wxml': {
        ...createRollupAsset(firstSource),
        fileName: 'pages/first/index.wxml',
      },
      'pages/second/index.wxml': {
        ...createRollupAsset(secondSource),
        fileName: 'pages/second/index.wxml',
      },
    }, createOptions(), path.join(rootDir, 'dist'))
    const sourceFiles = new Map([
      ['pages/first/index.wxml', path.join(rootDir, 'src/pages/first/index.vue')],
      ['pages/second/index.wxml', path.join(rootDir, 'src/pages/second/index.vue')],
    ])
    const extractSourceCandidates = vi.fn(async (_file: string, source: string) => new Set(
      [...source.matchAll(/class="([^"]+)"/g)].flatMap(match => match[1]!.split(/\s+/)),
    ))

    const collection = await collectBundleMarkupCandidates({
      extractSourceCandidates,
      resolveSourceCandidateFile: file => sourceFiles.get(file),
      rootDir,
      snapshot,
      transformFilter: createTransformFilter(undefined, rootDir),
    })

    expect(extractSourceCandidates).toHaveBeenCalledTimes(2)
    expect(collection.values).toEqual(new Set(['source-only', 'bundle-added', 'second-added']))
    expect(collection.valuesForEntries([])).toEqual(new Set())
    expect(collection.valuesForEntries([{
      base: path.join(rootDir, 'src'),
      negated: false,
      pattern: 'pages/first/**/*',
    }])).toEqual(new Set(['source-only', 'bundle-added']))
    expect(collection.valuesForEntries(undefined, {
      excludeEntries: [{
        base: path.join(rootDir, 'src'),
        negated: false,
        pattern: 'pages/second/**/*',
      }],
    })).toEqual(new Set(['source-only', 'bundle-added']))
  })

  it('honors transform filters and returns an empty build-local collection when extraction is disabled', async () => {
    const rootDir = '/project'
    const snapshot = buildBundleSnapshotForBuild({
      'pages/index/index.wxml': {
        ...createRollupAsset('<view class="bundle-added" />'),
        fileName: 'pages/index/index.wxml',
      },
    }, createOptions(), path.join(rootDir, 'dist'))
    const extractSourceCandidates = vi.fn(async () => new Set(['bundle-added']))

    const excluded = await collectBundleMarkupCandidates({
      extractSourceCandidates,
      resolveSourceCandidateFile: () => path.join(rootDir, 'src/pages/index/index.wxml'),
      rootDir,
      snapshot,
      transformFilter: createTransformFilter({ exclude: ['pages/**'] }, rootDir),
    })
    const disabled = await collectBundleMarkupCandidates({
      resolveSourceCandidateFile: () => path.join(rootDir, 'src/pages/index/index.wxml'),
      rootDir,
      snapshot,
      transformFilter: undefined,
    })

    expect(extractSourceCandidates).not.toHaveBeenCalled()
    expect(excluded.values).toEqual(new Set())
    expect(disabled.values).toEqual(new Set())
  })

  it('preserves omitted files only for partial incremental bundles', async () => {
    const rootDir = '/project'
    const previousCandidatesByFile = new Map([
      ['pages/first/index.wxml', { sourceFile: path.join(rootDir, 'src/pages/first/index.wxml'), candidates: new Set(['first-candidate']) }],
      ['pages/second/index.wxml', { sourceFile: path.join(rootDir, 'src/pages/second/index.wxml'), candidates: new Set(['stale-second-candidate']) }],
    ])
    const snapshot = buildBundleSnapshotForBuild({
      'pages/second/index.wxml': {
        ...createRollupAsset('<view class="current-second-candidate" />'),
        fileName: 'pages/second/index.wxml',
      },
    }, createOptions(), path.join(rootDir, 'dist'))
    const collect = (preserveMissingFiles: boolean) => collectBundleMarkupCandidates({
      extractSourceCandidates: async () => new Set(['current-second-candidate']),
      previousCandidatesByFile,
      preserveMissingFiles,
      resolveSourceCandidateFile: () => path.join(rootDir, 'src/pages/second/index.wxml'),
      rootDir,
      snapshot,
      transformFilter: undefined,
    })

    await expect(collect(true)).resolves.toMatchObject({
      values: new Set(['first-candidate', 'current-second-candidate']),
    })
    await expect(collect(false)).resolves.toMatchObject({
      values: new Set(['current-second-candidate']),
    })
  })
})
