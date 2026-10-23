import type { OutputAsset, OutputBundle } from 'rollup'
import type { ViteFrameworkCssPipelineStrategy } from '@/bundlers/vite/shared/framework-strategy'
import type { InternalUserDefinedOptions } from '@/types'
import { describe, expect, it, vi } from 'vitest'
import { injectViteProcessedCssIntoMainCssAssets } from '@/bundlers/vite/processed-css-assets'
import { resolveConfiguredCssEntryRootInjectionTarget } from '@/bundlers/vite/processed-css-assets/cleanup'
import { createFrameworkAssetAccess } from '@/bundlers/vite/shared/framework-assets'
import { createFrameworkCssContext, extendFrameworkCssContext } from '@/bundlers/vite/shared/framework-css-context'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'

function asset(fileName: string, source: string): OutputAsset {
  return { type: 'asset', fileName, source, names: [], originalFileNames: [] }
}

function createFixture(extension: string) {
  const sourcesContent = vi.fn(() => ['original source'])
  const bundle: OutputBundle = {
    [`shell.${extension}`]: asset(`shell.${extension}`, `@import "./theme.${extension}";`),
    [`theme.${extension}`]: asset(`theme.${extension}`, '.author{color:red}'),
    'entry.js': {
      type: 'chunk',
      fileName: 'entry.js',
      code: 'initial()',
      map: { get sourcesContent() { return sourcesContent() } },
      viteMetadata: { importedCss: new Set([`theme.${extension}`]) },
    } as unknown as OutputBundle[string],
  }
  const opts = {
    appType: 'taro',
    cssEntries: ['source.css'],
    cssMatcher: (file: string) => file.endsWith(`.${extension}`),
    mainCssChunkMatcher: (file: string) => file === `shell.${extension}`,
    escapeMap: {},
  } as InternalUserDefinedOptions
  const currentGeneratorOptions = normalizeWeappTailwindcssGeneratorOptions({ target: 'weapp' })
  const context = createFrameworkCssContext({
    bundle,
    currentGeneratorBranch: currentGeneratorOptions.branch,
    currentGeneratorOptions,
    opts,
    resolvedConfig: undefined,
    resolveStylePlatform: () => undefined,
  })
  return { bundle, opts, context, sourcesContent }
}

describe('framework CSS asset demand', () => {
  it.each(['wxss', 'acss'])('keeps %s import shells and updates CSS without reading script metadata', (extension) => {
    const { bundle, opts, context, sourcesContent } = createFixture(extension)
    const strategy: ViteFrameworkCssPipelineStrategy = { styles: { rootImportShell: 'extract' } }
    for (const color of ['blue', 'green']) {
      bundle[`theme.${extension}`] = asset(`theme.${extension}`, '.author{color:red}')
      injectViteProcessedCssIntoMainCssAssets(bundle, {
        opts,
        cssPipelineStrategy: strategy,
        createCssPipelineContext: () => context,
        getViteProcessedCssAssetResults: () => [
          ['source.css', { css: `.generated{color:${color}}`, injectIntoMain: true, outputFile: `shell.${extension}` }],
        ],
      })
      expect((bundle[`shell.${extension}`] as OutputAsset).source).toBe(`@import "./theme.${extension}";`)
      expect((bundle[`theme.${extension}`] as OutputAsset).source).toContain(`.generated{color:${color}}`)
    }
    expect(sourcesContent).not.toHaveBeenCalled()
  })

  it('does not materialize assets for configured entries without a dynamic target resolver', () => {
    const { bundle, opts, context, sourcesContent } = createFixture('css')
    const createCssPipelineContext = vi.fn(() => context)
    expect(resolveConfiguredCssEntryRootInjectionTarget(bundle, {
      opts,
      createCssPipelineContext,
      cssPipelineStrategy: { styles: { rootImportShell: 'extract' } },
    }, 'source.css', 'theme.css')).toBeUndefined()
    expect(createCssPipelineContext).not.toHaveBeenCalled()
    expect(sourcesContent).not.toHaveBeenCalled()
  })

  it('provides one current readonly asset view to each dynamic resolver invocation', () => {
    const { bundle, opts, context, sourcesContent } = createFixture('css')
    const snapshots: unknown[] = []
    const resolveTarget = vi.fn(({ assets, matchesMainCss }) => {
      snapshots.push(assets)
      expect(Object.isFrozen(assets)).toBe(true)
      expect(Object.isFrozen(assets['entry.js'].map.sourcesContent)).toBe(true)
      expect(() => {
        assets['theme.css'].source = '.wrong{}'
      }).toThrow()
      expect(matchesMainCss('shell.css')).toBe(true)
      return assets['theme.css'].source === '.updated{}' ? 'theme.css' : 'shell.css'
    })
    const options = {
      opts,
      createCssPipelineContext: () => context,
      cssPipelineStrategy: { styles: { resolveConfiguredCssEntryRootInjectionTarget: resolveTarget } },
    }
    expect(resolveConfiguredCssEntryRootInjectionTarget(bundle, options, 'source.css', 'theme.css')).toBe('shell.css')
    expect(sourcesContent).toHaveBeenCalledTimes(1)
    ;(bundle['theme.css'] as OutputAsset).source = '.updated{}'
    expect(resolveConfiguredCssEntryRootInjectionTarget(bundle, options, 'source.css', 'theme.css')).toBe('theme.css')
    expect(sourcesContent).toHaveBeenCalledTimes(2)
    expect(snapshots[0]).not.toBe(snapshots[1])
    expect((bundle['theme.css'] as OutputAsset).source).toBe('.updated{}')
  })

  it('does not read assets when a dynamic resolver only needs source or platform facts', () => {
    const { bundle, opts, context, sourcesContent } = createFixture('css')
    const resolveTarget = vi.fn(({ sourceFile }) => sourceFile === 'source.css' ? 'shell.css' : undefined)
    expect(resolveConfiguredCssEntryRootInjectionTarget(bundle, {
      opts,
      createCssPipelineContext: () => context,
      cssPipelineStrategy: { styles: { resolveConfiguredCssEntryRootInjectionTarget: resolveTarget } },
    }, 'source.css', 'theme.css')).toBe('shell.css')
    expect(resolveTarget).toHaveBeenCalledOnce()
    expect(sourcesContent).not.toHaveBeenCalled()
  })

  it('keeps extended contexts readonly and reads current assets after controlled commits', () => {
    const { bundle, context, sourcesContent } = createFixture('css')
    const access = createFrameworkAssetAccess(bundle)
    const request = extendFrameworkCssContext(context, { file: 'theme.css' })
    const nextRequest = extendFrameworkCssContext(request, { file: 'shell.css' })
    expect(Object.isFrozen(nextRequest)).toBe(true)
    expect(nextRequest.file).toBe('shell.css')
    expect(request.file).toBe('theme.css')
    expect(sourcesContent).not.toHaveBeenCalled()

    const before = nextRequest.assets!
    expect(sourcesContent).toHaveBeenCalledTimes(1)
    access.replaceText('theme.css', '.updated{}')
    access.replaceText('entry.js', 'updated()')
    access.emit('generated.css', '.generated{}')
    access.remove('shell.css')
    const after = nextRequest.assets!
    expect(sourcesContent).toHaveBeenCalledTimes(2)
    expect(after).not.toBe(before)
    expect(before['theme.css']).toHaveProperty('source', '.author{color:red}')
    expect(after['theme.css']).toHaveProperty('source', '.updated{}')
    expect(after['entry.js']).toHaveProperty('code', 'updated()')
    expect(before['generated.css']).toBeUndefined()
    expect(after['generated.css']).toHaveProperty('source', '.generated{}')
    expect(after['shell.css']).toBeUndefined()
    expect(before['shell.css']).toBeDefined()
    expect(Object.isFrozen(after)).toBe(true)
    expect(() => {
      (after['theme.css'] as any).source = '.wrong{}'
    }).toThrow()
    expect(() => {
      (nextRequest as any).file = 'other.css'
    }).toThrow()
    expect(bundle['theme.css']).toHaveProperty('source', '.updated{}')
  })
})
