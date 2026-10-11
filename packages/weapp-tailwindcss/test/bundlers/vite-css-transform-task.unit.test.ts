import type { ExecuteViteCssTransformTaskOptions } from '../../src/bundlers/vite/generate-bundle/css-transform-task'
import { describe, expect, it, vi } from 'vitest'
import { executeViteCssTransformTask } from '../../src/bundlers/vite/generate-bundle/css-transform-task'

function createOptions(
  overrides: Partial<ExecuteViteCssTransformTaskOptions> = {},
): ExecuteViteCssTransformTaskOptions {
  return {
    annotateCss: css => `traced:${css}`,
    cssUserHandlerOptions: {},
    debug: vi.fn(),
    file: 'pages/index.acss',
    generatorCssHandlerOptions: {},
    generatorRawSource: '.raw { color: red; }',
    generatorSourceFile: '/project/src/pages/index.css',
    getSourceCandidatesForEntries: undefined,
    isWebGeneratorTarget: false,
    normalizeGeneratorUserRawSource: source => `user:${source}`,
    normalizeMiniProgramGeneratorRawSource: source => `mini:${source}`,
    opts: {} as ExecuteViteCssTransformTaskOptions['opts'],
    outputFile: 'pages/index.acss',
    rawSource: '.raw { color: red; }',
    removeRootCoveredCssFromScopedAsset: css => `scoped:${css}`,
    runtime: new Set(['text-red-500']),
    runtimeState: {
      readyPromise: Promise.resolve(),
      tailwindRuntime: {} as ExecuteViteCssTransformTaskOptions['runtimeState']['tailwindRuntime'],
    },
    styleHandler: vi.fn(async source => ({ css: `styled:${source}` })),
    styleHandlerOptions: {},
    transformWebTargetCss: css => `web:${css}`,
    usesConfiguredTailwindV4FallbackSource: false,
    vitePipelineCssAsset: false,
    ...overrides,
  }
}

describe('vite css transform task', () => {
  it('returns a structured Tailwind generation result', async () => {
    const generateCss = vi.fn(async () => ({
      classSet: new Set(['text-red-500']),
      css: '.generated { color: red; }',
      dependencies: ['/project/tailwind.config.ts'],
      metadata: {
        file: '/project/src/pages/index.css',
      },
      source: 'generator' as const,
      target: 'weapp',
    }))
    const result = await executeViteCssTransformTask(createOptions({
      generateCss,
      generatorRawSource: '@import "tailwindcss";',
      previousCss: '.previous {}',
    }))

    expect(generateCss).toHaveBeenCalledWith(expect.objectContaining({
      cssStage: 'framework-processed',
      previousCss: 'mini:.previous {}',
      rawSource: '@import "tailwindcss";',
      restoreLocalCssImports: undefined,
    }))
    expect(result).toEqual({
      classSet: new Set(['text-red-500']),
      css: 'scoped:traced:web:.generated { color: red; }',
      dependencies: ['/project/tailwind.config.ts'],
      diffSource: '@import "tailwindcss";',
      generatorTarget: 'weapp',
      kind: 'tailwind',
      shouldRecordCssAsset: true,
    })
  })

  it('preserves web css through the web compatibility transform', async () => {
    const styleHandler = vi.fn(async source => ({ css: source }))
    const result = await executeViteCssTransformTask(createOptions({
      isWebGeneratorTarget: true,
      rawSource: '.web { display: flex; }',
      styleHandler,
    }))

    expect(result.kind).toBe('web')
    expect(result.css).toBe('traced:web:.web { display: flex; }')
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it.each([false, true])('preserves aggregate web css with remembered apply source=%s', async (rememberedApply) => {
    const generateCss = vi.fn()
    const rawSource = '/*! weapp-tailwindcss vite-generated-css:src%2Fmain.css */\n.generated { display: flex; }\n.user { color: red; }'
    const result = await executeViteCssTransformTask(createOptions({
      generateCss,
      generatorRawSource: rememberedApply ? '.generated { @apply flex; }' : rawSource,
      isWebGeneratorTarget: true,
      rawSource,
      transformWebTargetCss: css => css,
    }))

    expect(generateCss).not.toHaveBeenCalled()
    expect(result.kind).toBe('web')
    expect(result.css).toContain('.generated { display: flex; }')
    expect(result.css).toContain('.user { color: red; }')
  })

  it('regenerates a compiled web entry from its root source when candidates change', async () => {
    const generateCss = vi.fn(async () => ({
      css: '.new-candidate { color: purple; }',
      classSet: new Set(['new-candidate']),
      dependencies: [],
      metadata: { file: '/project/styles/entry.css' },
      source: 'generator' as const,
      target: 'h5',
    }))
    const result = await executeViteCssTransformTask(createOptions({
      generateCss,
      generatorRawSource: '@import "tailwindcss";',
      isWebGeneratorTarget: true,
      rawSource: '/*! weapp-tailwindcss vite-generated-css:entry.css */\n.old-candidate { color: red; }',
      runtime: new Set(['new-candidate']),
    }))
    expect(generateCss).toHaveBeenCalledWith(expect.objectContaining({
      rawSource: '@import "tailwindcss";',
      runtime: new Set(['new-candidate']),
    }))
    expect(result.css).toContain('.new-candidate')
    expect(result.kind).toBe('tailwind')
  })

  it.each([
    '/project/styles/entry.css',
    'C:\\project\\styles\\entry.css',
    'styles/entry.css',
    '/entry.css',
  ])('replaces only the generated module inside a web bundle: %s', async (sourceFile) => {
    const markerFile = encodeURIComponent(sourceFile)
    const rawSource = `.before{color:orange}/*! weapp-tailwindcss vite-generated-css:${markerFile} */.old-candidate{color:red}/*! weapp-tailwindcss vite-generated-css-end:${markerFile} */.reset-button{display:block}.user{color:blue}`
    const generateCss = vi.fn(async () => ({
      css: '.new-candidate{color:purple}',
      classSet: new Set(['new-candidate']),
      dependencies: [],
      metadata: { file: sourceFile },
      source: 'generator' as const,
      target: 'web',
    }))
    const result = await executeViteCssTransformTask(createOptions({
      annotateCss: css => css,
      generateCss,
      generatorRawSource: '@import "tailwindcss";',
      generatorSourceFile: sourceFile,
      isWebGeneratorTarget: true,
      rawSource,
      removeRootCoveredCssFromScopedAsset: css => css,
      transformWebTargetCss: css => css,
    }))
    expect(result.css).toBe('.before{color:orange}.new-candidate{color:purple}.reset-button{display:block}.user{color:blue}')
    expect(result.css).not.toContain('.old-candidate')
  })

  it('preserves pure local import shells without invoking the style handler', async () => {
    const styleHandler = vi.fn(async source => ({ css: source }))
    const result = await executeViteCssTransformTask(createOptions({
      generatorRawSource: '@import "./shared.acss";',
      styleHandler,
    }))

    expect(result.kind).toBe('import-shell')
    expect(result.css).toBe('traced:@import "./shared.acss";')
    expect(result.shouldRecordCssAsset).toBe(true)
    expect(styleHandler).not.toHaveBeenCalled()
  })

  it('falls back to the style handler for ordinary mini-program css', async () => {
    const result = await executeViteCssTransformTask(createOptions())

    expect(result).toEqual({
      css: 'traced:styled:.raw { color: red; }',
      dependencies: [],
      diffSource: '.raw { color: red; }',
      kind: 'style',
      shouldRecordCssAsset: false,
    })
  })

  it('passes normalized user css and configured import policy to generation', async () => {
    const generateCss = vi.fn(async () => undefined)
    await executeViteCssTransformTask(createOptions({
      assetSourceFile: '/project/src/app.css',
      generateCss,
      generatorRawSource: '@import "tailwindcss";',
      generatorUserLayerRawSource: '.layer {}',
      rawSource: '.user {}',
      usesConfiguredTailwindV4FallbackSource: true,
      vitePipelineCssAsset: true,
    }))

    expect(generateCss).toHaveBeenCalledWith(expect.objectContaining({
      restoreLocalCssImports: false,
      userRawSource: '.layer {}',
      frameworkProcessedUserCss: 'mini:user:.user {}',
    }))
  })
})
