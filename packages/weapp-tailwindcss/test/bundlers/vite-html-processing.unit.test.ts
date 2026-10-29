import type { OutputAsset } from 'rollup'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { createCache } from '@/cache'
import { buildBundleSnapshotForBuild } from '@/bundlers/vite/bundle-state'
import { processHtmlBundleEntry } from '@/bundlers/vite/generate-bundle/html-processing'
import { createEmptyMetrics } from '@/bundlers/vite/generate-bundle/metrics'
import { collectTemplateAssetStyles } from '@/bundlers/vite/generate-bundle/template-assets'
import { createUniAppXAssetPipeline } from '@/bundlers/vite/frameworks/uni-app-x/asset-pipeline'
import type { ViteFrameworkTemplateAssetTransform } from '@/bundlers/vite/shared/framework-asset-strategy'
import { replaceWxml } from '@/wxml'
import { createTemplateHandler } from '@/wxml/utils'
import { createContext, createRollupAsset } from './vite-plugin.testkit'

interface ProcessAssetOptions {
  asset: OutputAsset
  cache?: ReturnType<typeof createCache>
  dynamicRetryCandidates?: Set<string>
  ensureRuntimeClassSet?: (force?: boolean) => Promise<Set<string>>
  onUpdate?: ReturnType<typeof vi.fn>
  source?: string
  sourceCandidate?: string
  templateHandler?: (source: string, options: { runtimeSet: Set<string> }) => string | Promise<string>
  templateTransform?: ViteFrameworkTemplateAssetTransform
  transformRuntime?: Set<string>
}

async function processAsset(options: ProcessAssetOptions) {
  const source = options.source ?? options.asset.source.toString()
  const runtimeSet = options.transformRuntime ?? new Set(['tracking-[0.2em]'])
  const tasks: Promise<void>[] = []
  processHtmlBundleEntry({
    cache: options.cache ?? createCache(),
    context: {
      ensureRuntimeClassSet: options.ensureRuntimeClassSet ?? vi.fn(async () => runtimeSet),
    },
    debug: vi.fn(),
    dynamicRetryCandidates: options.dynamicRetryCandidates ?? runtimeSet,
    file: options.asset.fileName,
    metrics: createEmptyMetrics(),
    onUpdate: options.onUpdate ?? vi.fn(),
    originalEntrySource: source,
    originalSource: options.asset,
    rememberProcessCacheKey: vi.fn(),
    resolveCurrentSourceCandidateSource: () => options.sourceCandidate,
    tasks,
    templateHandler: options.templateHandler ?? createTemplateHandler(),
    templateTransform: options.templateTransform,
    timeTask: async (_name, task) => task(),
    transformRuntime: runtimeSet,
    transformRuntimeSignature: [...runtimeSet].sort().join(','),
  })
  await Promise.all(tasks)
}

describe('bundlers/vite html bundle processing', () => {
  it('invalidates compiled-host transforms when their own style carrier changes', async () => {
    const cache = createCache()
    const templateHandler = vi.fn(createTemplateHandler())
    const pipeline = createUniAppXAssetPipeline({ appType: 'uni-app-x', cssPreflight: { 'border-width': '0' } })
    const source = '<view class="border-t-[1px] border-solid"><label>说明</label></view>'
    const run = async (css: string) => {
      const template = { ...createRollupAsset(source), fileName: 'widgets/footer.axml' }
      const style = { ...createRollupAsset(css), fileName: 'widgets/footer.acss' }
      const bundle = { [template.fileName]: template, [style.fileName]: style }
      const snapshot = buildBundleSnapshotForBuild(bundle, createContext({ cssMatcher: (file: string) => file.endsWith('.acss'), htmlMatcher: (file: string) => file.endsWith('.axml') }) as any, '/virtual/dist')
      const styles = collectTemplateAssetStyles(snapshot)(template.fileName)
      await processAsset({ asset: template, cache, templateHandler, templateTransform: pipeline.prepareTemplateAsset?.({ file: template.fileName, styles }) })
      return template.source.toString()
    }
    expect(await run('.weapp-tw-border{border-width:0}')).toContain('class="weapp-tw-border border-t-')
    expect(await run('.weapp-tw-border{border-width:0}')).toContain('class="weapp-tw-border border-t-')
    expect(templateHandler).toHaveBeenCalledTimes(1)
    expect(await run('.author{border-top-width:1px}')).not.toContain('weapp-tw-border')
    expect(templateHandler).toHaveBeenCalledTimes(2)
    expect(await run('.weapp-tw-border{border-width:0}')).toContain('class="weapp-tw-border border-t-')
    expect(templateHandler).toHaveBeenCalledTimes(2)
  })

  it('transforms the current bundle asset without replacing structure from earlier plugins', async () => {
    const sourceCandidate = '<view class="tracking-[0.2em]">content</view>'
    const bundleSource = [
      '<block wx:if="{{enabled}}" data-injected="layout">',
      '  <custom-layout>',
      '    <view class="tracking-[0.2em]">content</view>',
      '  </custom-layout>',
      '</block>',
    ].join('\n')
    const asset = {
      ...createRollupAsset(bundleSource),
      fileName: 'pages/index/index.wxml',
    } satisfies OutputAsset
    const onUpdate = vi.fn()
    await processAsset({
      asset,
      onUpdate,
      sourceCandidate,
    })

    const output = asset.source.toString()
    expect(output).toContain('<block wx:if="{{enabled}}" data-injected="layout">')
    expect(output).toContain('<custom-layout>')
    expect(output).toContain(`class="${replaceWxml('tracking-[0.2em]')}"`)
    expect(output).not.toBe(`<view class="${replaceWxml('tracking-[0.2em]')}">content</view>`)
    expect(onUpdate).toHaveBeenCalledWith(asset.fileName, bundleSource, output)
  })

  it('keys cache entries by current bundle source across watch rebuilds', async () => {
    const cache = createCache()
    const sourceCandidate = '<view class="tracking-[0.2em]">content</view>'
    const templateHandler = vi.fn(createTemplateHandler())
    const createAsset = (condition: string) => ({
      ...createRollupAsset(`<block wx:if="{{${condition}}}">${sourceCandidate}</block>`),
      fileName: 'pages/index/index.wxml',
    }) satisfies OutputAsset

    const firstAsset = createAsset('enabled')
    await processAsset({ asset: firstAsset, cache, sourceCandidate, templateHandler })
    expect(firstAsset.source.toString()).toContain('{{enabled}}')
    expect(templateHandler).toHaveBeenCalledTimes(1)

    const replayAsset = createAsset('enabled')
    await processAsset({ asset: replayAsset, cache, sourceCandidate, templateHandler })
    expect(replayAsset.source).toBe(firstAsset.source)
    expect(templateHandler).toHaveBeenCalledTimes(1)

    const changedAsset = createAsset('visible')
    await processAsset({ asset: changedAsset, cache, sourceCandidate, templateHandler })
    expect(changedAsset.source.toString()).toContain('{{visible}}')
    expect(changedAsset.source.toString()).not.toContain('{{enabled}}')
    expect(templateHandler).toHaveBeenCalledTimes(2)
  })

  it('retries dynamic classes against the current bundle source', async () => {
    const sourceCandidate = '<view>source</view>'
    const bundleSource = '<custom-layout><view class="{{enabled ? \'tracking-[0.2em]\' : \'\'}}">content</view></custom-layout>'
    const asset = {
      ...createRollupAsset(bundleSource),
      fileName: 'pages/index/index.wxml',
    } satisfies OutputAsset
    const templateHandler = vi.fn(async (source: string) => {
      return templateHandler.mock.calls.length === 1
        ? source
        : source.replace('tracking-[0.2em]', replaceWxml('tracking-[0.2em]'))
    })

    await processAsset({
      asset,
      dynamicRetryCandidates: new Set(['tracking-[0.2em]']),
      ensureRuntimeClassSet: vi.fn(async () => new Set(['tracking-[0.2em]'])),
      sourceCandidate,
      templateHandler,
      transformRuntime: new Set<string>(),
    })

    expect(templateHandler).toHaveBeenCalledTimes(2)
    expect(templateHandler.mock.calls.every(([source]) => source === bundleSource)).toBe(true)
    expect(asset.source.toString()).toContain('<custom-layout>')
    expect(asset.source.toString()).toContain(replaceWxml('tracking-[0.2em]'))
  })

  it.each([
    ['Buffer', (source: string) => Buffer.from(source)],
    ['Uint8Array', (source: string) => new TextEncoder().encode(source)],
  ])('preserves multiple %s-backed bundle assets', async (_label, encode) => {
    const firstSource = '<first-layout><view class="tracking-[0.2em]">first</view></first-layout>'
    const secondSource = '<second-layout data-added="true"><view class="tracking-[0.2em]">second</view></second-layout>'
    const bundle = {
      'pages/first.wxml': {
        ...createRollupAsset(firstSource),
        fileName: 'pages/first.wxml',
        source: encode(firstSource),
      },
      'pages/second.wxml': {
        ...createRollupAsset(secondSource),
        fileName: 'pages/second.wxml',
        source: encode(secondSource),
      },
    }
    const context = createContext()
    const snapshot = buildBundleSnapshotForBuild(bundle, context as any, '/virtual/dist')

    await Promise.all(snapshot.entries.map(async (entry) => {
      if (entry.type === 'html' && entry.output.type === 'asset') {
        await processAsset({
          asset: entry.output,
          source: entry.source,
          sourceCandidate: '<view class="tracking-[0.2em]">source</view>',
        })
      }
    }))

    expect(bundle['pages/first.wxml'].source.toString()).toContain('<first-layout>')
    expect(bundle['pages/second.wxml'].source.toString()).toContain('<second-layout data-added="true">')
    expect(bundle['pages/first.wxml'].source.toString()).toContain(replaceWxml('tracking-[0.2em]'))
    expect(bundle['pages/second.wxml'].source.toString()).toContain(replaceWxml('tracking-[0.2em]'))
  })
})
