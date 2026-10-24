import type { OutputAsset, OutputBundle } from 'rollup'
import { describe, expect, it, vi } from 'vitest'
import { createBundlerGeneratedCssEndMarker, createBundlerGeneratedCssMarker } from '@/bundlers/shared/generated-css-marker'
import { syncProcessedCss } from '@/bundlers/vite/generate-bundle/finalize/sync-processed-css'
import { collectViteProcessedCssAssetResults } from '@/bundlers/vite/processed-css-assets'
import { createFrameworkSourceCandidatesPluginForCssOnly } from '@/bundlers/vite/shared/css-only-source-candidates'
import { createFrameworkProcessedCssRegistry } from '@/bundlers/vite/shared/framework-processed-css-registry'
import { createFrameworkSourceCandidatesPlugin } from '@/bundlers/vite/shared/framework-source-candidates-plugin'
import { createRollupAsset } from './vite-plugin.testkit'

function asset(file: string, sources: string[], names: string[] = ['entry.css']): OutputAsset {
  return {
    ...createRollupAsset(sources.map(source => `${createBundlerGeneratedCssMarker('vite', source)}\n.rule { color: red; }\n${createBundlerGeneratedCssEndMarker('vite', source)}`).join('\n')),
    fileName: file,
    name: names[0],
    names,
  }
}

function harness() {
  const registry = createFrameworkProcessedCssRegistry()
  const publish = (...assets: OutputAsset[]) => {
    const bundle = Object.fromEntries(assets.map(output => [output.fileName, output])) as OutputBundle
    collectViteProcessedCssAssetResults(bundle, {
      replaceViteProcessedCssAssetOutputs: registry.replaceOutputs,
      isViteProcessedCssAsset: () => false,
    })
    for (const output of assets) {
      registry.record(output.fileName, String(output.source), { outputFile: 'shared-root.css', injectIntoMain: true })
    }
  }
  return { registry, publish }
}

describe('Vite 已处理 CSS 的来源与产物投影', () => {
  it.each([
    '/workspace/styles/entry.css',
    String.raw`C:\workspace\styles\entry.css`,
    '/entry.css',
    'styles/entry.css',
    String.raw`styles\entry.css`,
  ])('替换具名产物而不根据活跃根目标保留旧内容：%s', (source) => {
    const { registry, publish } = harness()
    registry.record(source, 'source-only')
    registry.record('shared-root.css', 'aggregate-only')
    publish(asset('assets/old.css', [source]))
    registry.prune(new Set(['shared-root.css']))
    expect(registry.get('assets/old.css')).toBeDefined()
    publish(asset('assets/new.css', [source]))
    expect(registry.get('assets/old.css')).toBeUndefined()
    expect(registry.get('assets/new.css')).toBeDefined()
    expect(registry.get('shared-root.css')?.css).toBe('aggregate-only')
  })

  it('同来源多投影与同投影多资产不互相撤销，部分图只替换明确出现的投影', () => {
    const { registry, publish } = harness()
    const source = '/workspace/entry.css'
    const other = '/workspace/other.css'
    registry.record(source, 'source-only', { outputFile: 'shared-root.css' })
    publish(asset('assets/old-primary.css', [source], ['primary.css']), asset('assets/secondary.css', [source], ['secondary.css']), asset('assets/other.css', [other]))
    publish(asset('assets/new-primary-one.css', [source], ['primary.css']), asset('assets/new-primary-two.css', [source], ['primary.css']))
    expect(registry.get('assets/old-primary.css')).toBeUndefined()
    for (const file of ['assets/new-primary-one.css', 'assets/new-primary-two.css', 'assets/secondary.css', 'assets/other.css']) {
      expect(registry.get(file)).toBeDefined()
    }
    expect(registry.get(source)?.css).toBe('source-only')
    publish()
    expect(registry.get('assets/secondary.css')).toBeDefined()
  })

  it('多来源合并资产在来源投影替换或删除后撤销，发射名称顺序不改变身份', () => {
    const { registry, publish } = harness()
    const sources = ['/workspace/a.css', '/workspace/b.css']
    publish(asset('assets/old.css', sources, ['a.css', 'b.css']))
    publish(asset('assets/new.css', sources, ['b.css', 'a.css']))
    expect(registry.get('assets/old.css')).toBeUndefined()
    expect(registry.get('assets/new.css')).toBeDefined()
    registry.removeSource(sources[0]!)
    expect(registry.get('assets/new.css')).toBeUndefined()
    registry.removeSource(sources[1]!)
    expect(registry.get('assets/new.css')).toBeUndefined()
  })

  it('同一物理产物的别名减少时撤销旧资产，其他独立具名投影仍可重放', () => {
    const { registry, publish } = harness()
    const source = '/workspace/entry.css'
    publish(asset('assets/old.css', [source], ['a.css', 'b.css']), asset('assets/independent.css', [source], ['independent.css']))
    registry.record('assets/old.css', '.old-alias { width: 29px; }', { outputFile: 'shared-root.css' })
    publish(asset('assets/new.css', [source], ['a.css']))
    expect([...registry.entries()].map(([, result]) => result.css).join('\n')).not.toContain('.old-alias')
    expect(registry.get('assets/independent.css')).toBeDefined()
    expect(registry.get('assets/new.css')).toBeDefined()
  })

  it.for(['replace', 'delete'] as const)('任一来源 %s 后复合快照失效，其他来源与独立资产保持有效', (operation) => {
    const { registry, publish } = harness()
    const sourceA = '/workspace/a.css'
    const sourceB = '/workspace/b.css'
    registry.record(sourceB, '.source-b { color: blue; }')
    publish(asset('assets/composite.css', [sourceA, sourceB], ['shared.css']), asset('assets/b-only.css', [sourceB], ['b-only.css']))
    registry.record('assets/composite.css', '.old-a { width: 29px; } .old-b { color: blue; }', { outputFile: 'shared-root.css' })
    if (operation === 'replace') {
      publish(asset('assets/new-a.css', [sourceA], ['shared.css']))
    }
    else {
      registry.removeSource(sourceA)
    }
    expect([...registry.entries()].map(([, result]) => result.css).join('\n')).not.toContain('.old-a')
    expect(registry.get(sourceB)?.css).toContain('.source-b')
    expect(registry.get('assets/b-only.css')).toBeDefined()
    registry.removeSource(sourceB)
    expect(registry.get('assets/b-only.css')).toBeUndefined()
  })

  it('真实 collector 的复合别名失效后恢复独立来源，较新的独立写入不被撤销', () => {
    const registry = createFrameworkProcessedCssRegistry()
    const sourceA = '/workspace/a.css'
    const sourceB = '/workspace/b.css'
    const outputFile = 'assets/composite.css'
    registry.record(sourceA, '.independent-a { width: 17px; }')
    registry.record(sourceB, '.independent-b { color: blue; }')
    const output = asset(outputFile, [sourceA, sourceB])
    output.source = String(output.source).replaceAll('.rule', '.old-composite')
    collectViteProcessedCssAssetResults({ [outputFile]: output }, {
      isViteProcessedCssAsset: () => true,
      replaceViteProcessedCssAssetOutputs: registry.replaceOutputs,
      recordViteProcessedCssAssetResult: registry.record,
      resolveViteProcessedCssOutputFile: () => outputFile,
    })
    expect(registry.get(sourceB)?.css).toContain('.old-composite')
    registry.record('current-independent.css', '.new-independent { color: green; }', { sourceAsset: outputFile })
    registry.record('current-independent.css', '.new-independent { color: purple; }')
    registry.removeSource(sourceA)
    expect(registry.get(sourceA)).toBeUndefined()
    expect(registry.get(outputFile)).toBeUndefined()
    expect(registry.get(sourceB)?.css).toBe('.independent-b { color: blue; }')
    expect(registry.get('current-independent.css')?.css).toContain('purple')
    expect([...registry.entries()].map(([, result]) => result.css).join('\n')).not.toContain('.old-composite')
  })

  it.for([false, true])('当前批次仍声明的复合资产保留完整依赖，登记顺序不影响结果（reverse=%s）', (reverse) => {
    const { registry, publish } = harness()
    const sources = ['/workspace/a.css', '/workspace/b.css']
    publish(asset('assets/composite.css', sources))
    const current = [asset('assets/composite.css', sources), asset('assets/new-a.css', [sources[0]!])]
    publish(...reverse ? current.reverse() : current)
    expect(registry.get('assets/composite.css')).toBeDefined()
    expect(registry.get('assets/new-a.css')).toBeDefined()
    registry.removeSource(sources[1]!)
    expect(registry.get('assets/composite.css')).toBeUndefined()
    expect(registry.get('assets/new-a.css')).toBeDefined()
  })

  it.for([false, true])('资产在本轮重新取得其他来源归属时，不因遍历顺序撤销（reverse=%s）', (reverse) => {
    const { registry, publish } = harness()
    publish(asset('assets/shared.css', ['/workspace/a.css']))
    const current = [asset('assets/new-a.css', ['/workspace/a.css']), asset('assets/shared.css', ['/workspace/b.css'])]
    publish(...reverse ? current.reverse() : current)
    expect(registry.get('assets/shared.css')).toBeDefined()
    expect(registry.get('assets/new-a.css')).toBeDefined()
    registry.removeSource('/workspace/a.css')
    expect(registry.get('assets/shared.css')).toBeDefined()
  })

  it('复用现有 output key 规范化，来源删除只撤自身记录及失去所有者的产物', () => {
    const { registry, publish } = harness()
    const source = String.raw`C:\workspace\entry.css`
    registry.markSource(source)
    registry.record(source, 'source-only')
    registry.record('shared-root.css', 'aggregate-only')
    publish(asset(String.raw`assets\old.css`, [source], [String.raw`styles\entry.css`]), asset('assets/other.css', ['/other.css']))
    publish(asset('assets/new.css', ['C:/workspace/entry.css'], ['styles/entry.css']))
    expect(registry.get('assets/old.css')).toBeUndefined()
    registry.removeSource(source)
    expect(registry.get(source)).toBeUndefined()
    expect(registry.get('assets/new.css')).toBeUndefined()
    expect(registry.matchesIdentity(source)).toBe(false)
    expect(registry.get('assets/other.css')).toBeDefined()
    expect(registry.get('shared-root.css')?.css).toBe('aggregate-only')
  })

  it('没有发射名称时保留明确文件身份，不从文件名推测 hash 或来源替换', () => {
    const { registry, publish } = harness()
    publish(asset('assets/one.css', ['/workspace/entry.css'], []))
    publish(asset('assets/two.css', ['/workspace/entry.css'], []))
    expect(registry.get('assets/one.css')).toBeDefined()
    expect(registry.get('assets/two.css')).toBeDefined()
    registry.dispose()
    expect([...registry.entries()]).toEqual([])
  })

  it('最终收尾新引入的标记资产也更新归属，撤销上轮同名投影', () => {
    const { registry, publish } = harness()
    const source = '/workspace/entry.css'
    publish(asset('assets/old.css', [source]))
    const output = asset('assets/late.css', [source])
    syncProcessedCss({
      bundle: { [output.fileName]: output },
      opts: { cssMatcher: () => false },
      isViteProcessedCssAsset: () => false,
      replaceViteProcessedCssAssetOutputs: registry.replaceOutputs,
      getViteProcessedCssAssetResults: registry.entries,
      pendingRememberedCssReplayUpdates: [],
      recordTimingDetail: () => {},
    } as any)
    expect(registry.get('assets/old.css')).toBeUndefined()
    registry.record(output.fileName, '.late { color: red; }')
    registry.removeSource(source)
    expect(registry.get(output.fileName)).toBeUndefined()
  })

  it('完全退役的来源及产物索引一同裁剪，不影响之后同路径的独立记录', () => {
    const { registry, publish } = harness()
    for (let index = 0; index < 40; index++) {
      publish(asset(`assets/entry-${index}.css`, [`/workspace/entry-${index}.css`], [`entry-${index}.css`]))
    }
    registry.prune(new Set())
    expect(registry.getStats()).toMatchObject({
      viteProcessedCssAssetResults: 0,
      viteProcessedCssAssetProjections: 0,
      viteProcessedCssAssetOutputs: 0,
      viteProcessedCssAssetDerivedRecords: 0,
      viteProcessedCssAssetIndependentRecords: 0,
    })
    registry.record('assets/entry-0.css', '.unrelated { color: blue; }')
    registry.removeSource('/workspace/entry-0.css')
    expect(registry.get('assets/entry-0.css')?.css).toContain('.unrelated')
  })

  it.each(['framework', 'css-only'] as const)('%s 的显式来源删除会撤销投影', async (kind) => {
    const remove = vi.fn()
    const options = {
      removeViteProcessedCssSource: remove,
      shouldSkipSourceCandidateState: () => true,
      invalidateRecordedGeneratorCandidates: () => {},
      sourceScanSession: { invalidate: () => {}, syncChangedFile: async () => {} },
    }
    const plugin = kind === 'framework' ? createFrameworkSourceCandidatesPlugin(options) : createFrameworkSourceCandidatesPluginForCssOnly(options)
    const hook = typeof plugin.watchChange === 'function' ? plugin.watchChange : plugin.watchChange!.handler
    await hook.call({} as any, '/workspace/entry.css', { event: 'update' })
    expect(remove).not.toHaveBeenCalled()
    await hook.call({} as any, '/workspace/entry.css', { event: 'delete' })
    expect(remove).toHaveBeenCalledExactlyOnceWith('/workspace/entry.css')
  })
})
