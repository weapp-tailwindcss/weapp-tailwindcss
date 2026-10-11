import type { OutputAsset, OutputBundle } from 'rollup'
import { describe, expect, it } from 'vitest'
import { createBundlerGeneratedCssMarker } from '@/bundlers/shared/generated-css-marker'
import { createFrameworkStyleMemory } from '@/bundlers/vite/generate-bundle/framework-style-memory'

function asset(fileName: string, source: string): OutputAsset {
  return { type: 'asset', fileName, source, names: [], originalFileNames: [] } as unknown as OutputAsset
}

describe('framework styles in partial bundles', () => {
  it.each(['acss', 'ttss', 'qss'])('retains original contributions across %s rebuilds', (extension) => {
    const file = `framework.${extension}`
    const target = `generated.${extension}`
    const relations = new Map<string, string>()
    const memory = createFrameworkStyleMemory(relations)
    const first: OutputBundle = { [file]: asset(file, 'page{height:100%}') }
    const commit = memory.prepare(first, [])
    relations.set(file, target)
    first[file] = asset(file, `@import "./${target}";`)
    commit()
    const incremental: OutputBundle = {}
    memory.prepare(incremental, [])()
    expect((incremental[file] as OutputAsset).source).toBe('page{height:100%}')
    const changed: OutputBundle = { [file]: asset(file, 'page{height:90%}') }
    memory.prepare(changed, [])()
    const next: OutputBundle = {}
    memory.prepare(next, [])()
    expect((next[file] as OutputAsset).source).toBe('page{height:90%}')
    const removed: OutputBundle = {}
    memory.prepare(removed, [file])()
    expect(removed).toEqual({})
    expect(relations.size).toBe(0)
  })

  it('invalidates a raw contribution when the current asset becomes generated', () => {
    const relations = new Map([['framework.acss', 'generated.acss']])
    const memory = createFrameworkStyleMemory(relations)
    memory.prepare({ 'framework.acss': asset('framework.acss', '.removed{color:red}') }, [])()
    memory.prepare({ 'framework.acss': asset('framework.acss', `${createBundlerGeneratedCssMarker('vite', '/project/theme.css')} .current{color:blue}`) }, [])()
    const next: OutputBundle = {}
    memory.prepare(next, [])()
    expect(next).toEqual({})
  })

  it('does not retain unrelated root assets or revive a removed target', () => {
    const relations = new Map([['framework.acss', 'generated.acss']])
    const memory = createFrameworkStyleMemory(relations)
    memory.prepare({
      'framework.acss': asset('framework.acss', 'page{display:flex}'),
      'unrelated.acss': asset('unrelated.acss', '.other{}'),
    }, [])()
    const next: OutputBundle = {}
    memory.prepare(next, ['generated.acss'])()
    expect(next).toEqual({})
  })
})
