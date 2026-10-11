import { describe, expect, it, vi } from 'vitest'
import { createCache } from '@/cache'
import {
  buildRuntimeCompilationSnapshot,
  createRuntimeAffectingSourceSignature,
  createRuntimeCompilationAffectingSignature,
  createRuntimeCompilationBuildState,
  createRuntimeCompilationSnapshot,
  removeRuntimeCompilationBuildStateFiles,
  resetRuntimeCompilationBuildState,
  updateRuntimeCompilationBuildState,
} from '@/compiler'

function createEntry(file: string, source: string, type: 'html' | 'js' | 'css') {
  return {
    file,
    runtimeCandidate: type !== 'css',
    source,
    type,
  }
}

describe('compiler runtime snapshot', () => {
  it('avoids candidate parsing for excluded JS while preserving transforms and linked invalidation', () => {
    const cache = createCache()
    const state = createRuntimeCompilationBuildState()
    const signature = vi.fn(createRuntimeAffectingSourceSignature)
    const build = (source: string) => buildRuntimeCompilationSnapshot([
      createEntry('entry.js', 'import "./dependency.js"', 'js'),
      { ...createEntry('dependency.js', source, 'js'), runtimeCandidate: false },
    ], state, {
      computeHash: value => cache.computeHash(value),
      createRuntimeAffectingSignature: signature,
    })
    const linked = new Map([['entry.js', new Set(['dependency.js'])]])
    const source = 'export const cls = "w-[3rpx]"'
    const first = build(source)
    expect(first.processFiles.js).toEqual(new Set(['entry.js', 'dependency.js']))
    expect(signature).toHaveBeenCalledTimes(1)
    expect(signature).not.toHaveBeenCalledWith(source, 'js')
    updateRuntimeCompilationBuildState(state, first, linked)

    expect(build(source).runtimeAffectingChangedByType.js.size).toBe(0)
    for (const next of [source.replace('3rpx', '5rpx'), `${source};`, '']) {
      const snapshot = build(next)
      expect(snapshot.processFiles.js).toEqual(new Set(['dependency.js', 'entry.js']))
      expect(snapshot.runtimeAffectingChangedByType.js).toEqual(new Set(['dependency.js']))
      expect(snapshot.linkedImpactsByEntry.get('entry.js')).toEqual(new Set(['dependency.js']))
      updateRuntimeCompilationBuildState(state, snapshot, linked)
    }
    expect(signature).toHaveBeenCalledTimes(1)
    removeRuntimeCompilationBuildStateFiles(state, ['dependency.js'])
    expect(state.runtimeAffectingHashByFile.has('dependency.js')).toBe(false)
  })

  it('invalidates CSS token changes while reusing hashes for unchanged sources', () => {
    const state = createRuntimeCompilationBuildState()
    const cache = createCache()
    const signature = vi.fn(createRuntimeAffectingSourceSignature)
    const build = (source: string) => {
      const snapshot = buildRuntimeCompilationSnapshot([
        createEntry('theme.css', source, 'css'),
      ], state, {
        computeHash: value => cache.computeHash(value),
        createRuntimeAffectingSignature: signature,
      })
      updateRuntimeCompilationBuildState(state, snapshot, new Map())
      return snapshot
    }
    const first = '@theme { --font-label: "A  B"; }'
    build(first)
    expect(build(first).runtimeAffectingChangedByType.css.size).toBe(0)
    expect(signature).toHaveBeenCalledTimes(1)
    expect(build('@theme{--font-label:"A  B"}').runtimeAffectingChangedByType.css.size).toBe(0)
    expect(build('@theme{--font-label:"A B"}').runtimeAffectingChangedByType.css).toEqual(new Set(['theme.css']))
    expect(build('@theme{}').runtimeAffectingChangedByType.css).toEqual(new Set(['theme.css']))
  })

  it('creates explicit changed and process sets without bundler metadata', () => {
    const entries = [
      createEntry('pages/index.wxml', '<view class="foo" />', 'html'),
      createEntry('assets/index.js', 'const cls = "foo"', 'js'),
    ]
    const snapshot = createRuntimeCompilationSnapshot(entries, {
      changedFiles: ['assets/index.js'],
      processFiles: ['assets/index.js'],
      runtimeAffectingChangedFiles: ['assets/index.js'],
    })

    expect(snapshot.entries).toEqual(entries)
    expect(snapshot.entries.every(entry => !('output' in entry))).toBe(true)
    expect(snapshot.changedByType.js).toEqual(new Set(['assets/index.js']))
    expect(snapshot.runtimeAffectingChangedByType.js).toEqual(new Set(['assets/index.js']))
    expect(snapshot.processFiles.js).toEqual(new Set(['assets/index.js']))
  })

  it('reuses semantic hashes and queues linked dependents through one build state', () => {
    const cache = createCache()
    const state = createRuntimeCompilationBuildState()
    const build = (entries: ReturnType<typeof createEntry>[]) => buildRuntimeCompilationSnapshot(entries, state, {
      computeHash: source => cache.computeHash(source),
      createRuntimeAffectingSignature: createRuntimeAffectingSourceSignature,
    })
    const first = build([
      createEntry('assets/entry.js', 'import "./shared.js"\nconst cls = "foo"', 'js'),
      createEntry('assets/shared.js', 'export const cls = "foo"', 'js'),
    ])

    updateRuntimeCompilationBuildState(state, first, new Map([
      ['assets/entry.js', new Set(['assets/shared.js'])],
      ['assets/shared.js', new Set<string>()],
    ]))

    const second = build([
      createEntry('assets/entry.js', 'import "./shared.js"\nconst cls = "foo"', 'js'),
      createEntry('assets/shared.js', 'export const cls = "bar"', 'js'),
    ])

    expect(second.changedByType.js).toEqual(new Set(['assets/shared.js']))
    expect(second.processFiles.js).toEqual(new Set(['assets/shared.js', 'assets/entry.js']))
    expect(second.linkedImpactsByEntry.get('assets/entry.js')).toEqual(new Set(['assets/shared.js']))
    expect(second.runtimeAffectingSignatureByFile.has('assets/entry.js')).toBe(false)
  })

  it('removes evicted files and their linked state from the build state', () => {
    const state = createRuntimeCompilationBuildState()
    state.sourceHashByFile.set('entry.js', 'entry-hash')
    state.sourceHashByFile.set('shared.js', 'shared-hash')
    state.runtimeAffectingHashByFile.set('shared.js', 'runtime-hash')
    state.bundleMarkupCandidatesByFile.set('shared.js', { sourceFile: '/project/shared.ts', candidates: new Set(['flex']) })
    state.linkedByEntry.set('entry.js', new Set(['shared.js']))
    state.dependentsByLinkedFile.set('shared.js', new Set(['entry.js']))

    removeRuntimeCompilationBuildStateFiles(state, ['shared.js'])

    expect(state.sourceHashByFile.has('shared.js')).toBe(false)
    expect(state.runtimeAffectingHashByFile.has('shared.js')).toBe(false)
    expect(state.bundleMarkupCandidatesByFile.has('shared.js')).toBe(false)
    expect(state.linkedByEntry.get('entry.js')).toEqual(new Set())
    expect(state.dependentsByLinkedFile.has('shared.js')).toBe(false)
  })

  it('applies explicit removals to partial snapshots and incremental state', () => {
    const cache = createCache()
    const state = createRuntimeCompilationBuildState()
    const first = buildRuntimeCompilationSnapshot([
      createEntry('entry.js', 'const cls = "grid"', 'js'),
      createEntry('removed.js', 'const cls = "flex"', 'js'),
    ], state, {
      computeHash: value => cache.computeHash(value),
      createRuntimeAffectingSignature: createRuntimeAffectingSourceSignature,
    })
    updateRuntimeCompilationBuildState(state, first, new Map([
      ['entry.js', new Set(['removed.js'])],
    ]))

    const partial = buildRuntimeCompilationSnapshot([
      createEntry('entry.js', 'const cls = "grid"', 'js'),
    ], state, {
      computeHash: value => cache.computeHash(value),
      createRuntimeAffectingSignature: createRuntimeAffectingSourceSignature,
      hasOmittedKnownFiles: true,
      removedFiles: ['removed.js'],
    })
    expect(partial.removedFiles).toEqual(new Set(['removed.js']))

    updateRuntimeCompilationBuildState(state, partial, new Map(), { incremental: true })
    expect(state.sourceHashByFile.has('removed.js')).toBe(false)
    expect(state.runtimeAffectingHashByFile.has('removed.js')).toBe(false)
    expect(state.linkedByEntry.get('entry.js')).toEqual(new Set())
    expect(state.dependentsByLinkedFile.has('removed.js')).toBe(false)
  })

  it('creates stable semantic signatures and resets build state ownership', () => {
    const cache = createCache()
    const state = createRuntimeCompilationBuildState()
    const build = (source: string) => buildRuntimeCompilationSnapshot([
      createEntry('entry.js', source, 'js'),
    ], state, {
      computeHash: value => cache.computeHash(value),
      createRuntimeAffectingSignature: createRuntimeAffectingSourceSignature,
    })
    const first = build('const cls = "card"\nexport { cls }')
    const firstSignature = createRuntimeCompilationAffectingSignature(first, value => cache.computeHash(value))
    updateRuntimeCompilationBuildState(state, first, new Map())
    const sourceHashByFile = state.sourceHashByFile
    const second = build('const cls = "card";\n\nexport { cls }\n')

    expect(createRuntimeCompilationAffectingSignature(second, value => cache.computeHash(value))).toBe(firstSignature)

    resetRuntimeCompilationBuildState(state)

    expect(state.iteration).toBe(0)
    expect(state.sourceHashByFile).toBe(sourceHashByFile)
    expect(state.sourceHashByFile.size).toBe(0)
    expect(state.runtimeAffectingHashByFile.size).toBe(0)
  })
})
