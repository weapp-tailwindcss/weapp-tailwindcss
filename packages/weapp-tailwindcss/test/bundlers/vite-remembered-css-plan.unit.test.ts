import type { OutputAsset } from 'rollup'
import { describe, expect, it, vi } from 'vitest'
import { resolveViteCssCompositionPlan } from '@/bundlers/vite/generate-bundle/css-composition-plan'
import { resolveViteCssSourcePlan } from '@/bundlers/vite/generate-bundle/css-source-plan'
import { resolveRememberedCssSourcePlan } from '@/bundlers/vite/generate-bundle/remembered-css-plan'

function createAsset(fileName: string, source = ''): OutputAsset {
  return {
    fileName,
    name: undefined,
    needsCodeReference: false,
    originalFileName: undefined,
    originalFileNames: [],
    source,
    type: 'asset',
  }
}

function createOptions(overrides: Partial<Parameters<typeof resolveRememberedCssSourcePlan>[0]> = {}) {
  return {
    configuredSourceFileKeys: new Set<string>(),
    cssMatcher: (file: string) => file.endsWith('.wxss'),
    currentRawSourceHasExplicitScanContext: false,
    debug: vi.fn(),
    explicitConfiguredSourceFileKeys: new Set<string>(),
    file: 'pages/index/index.wxss',
    getRememberedCssSources: () => new Map(),
    getSfcSource: undefined,
    hasExplicitConfiguredRootSource: false,
    normalizeConfiguredSourceFile: (file: string) => file.replace(/[?#].*$/, ''),
    originalSource: createAsset('pages/index/index.wxss'),
    outputFile: 'pages/index/index.wxss',
    outputRoot: '/repo/dist',
    rawSource: '',
    resolveConfiguredRootSource: () => undefined,
    resolveMatchedOutputFile: () => undefined,
    resolveTemporarySource: () => undefined,
    shouldKeepCurrentRootOutput: () => false,
    snapshot: { entries: [] } as any,
    sourceRoot: '/repo/src',
    temporaryOutput: false,
    ...overrides,
  }
}

describe('vite remembered css source plan', () => {
  it('filters remembered sources against explicit scan and configured output scope', async () => {
    const sources = new Map([
      ['plain', {
        outputFile: 'pages/index/index.wxss',
        rawSource: '.plain{}',
        sourceFile: '/repo/src/plain.css',
      }],
      ['scanned', {
        outputFile: 'pages/index/index.wxss',
        rawSource: '@source "./pages/**/*.vue";',
        sourceFile: '/repo/src/scanned.css',
      }],
      ['other-output', {
        outputFile: 'pages/index/index.wxss',
        rawSource: '@source "./other/**/*.vue";',
        sourceFile: '/repo/src/other.css',
      }],
    ])

    const plan = await resolveRememberedCssSourcePlan(createOptions({
      configuredSourceFileKeys: new Set(['/repo/src/other.css']),
      currentRawSourceHasExplicitScanContext: true,
      getRememberedCssSources: () => sources,
      resolveMatchedOutputFile: sourceFile => sourceFile.endsWith('/other.css')
        ? 'pages/other/other.wxss'
        : undefined,
    }))

    expect(plan.sources.map(source => source.sourceFile)).toEqual(['/repo/src/scanned.css'])
    expect(plan.hasUsableTailwindSource).toBe(true)
  })

  it.each([false, true])('prefers the latest inferred sfc snapshot, with previous source=%s', async (hasPreviousSource) => {
    const sourceFile = '/repo/src/pages/index/index.vue'
    const sources = new Map([
      ['page', {
        outputFile: 'pages/index/index.wxss',
        rawSource: '.stale { @apply block; }',
        sourceFile: `${sourceFile}?vue&type=style&index=0`,
      }],
    ])
    const plan = await resolveRememberedCssSourcePlan(createOptions({
      getRememberedCssSources: () => hasPreviousSource ? sources : new Map(),
      getSfcSource: () => '<template></template><style>.latest { @apply flex; }</style>',
      snapshot: {
        entries: [{
          file: 'pages/index/index.js',
          output: {
            facadeModuleId: sourceFile,
            fileName: 'pages/index/index.js',
            moduleIds: [sourceFile],
            modules: { [sourceFile]: {} },
            type: 'chunk',
          },
          source: '',
          type: 'js',
        }],
      } as any,
    }))

    expect(plan.sources).toEqual([{
      outputFile: 'pages/index/index.wxss',
      rawSource: '.latest { @apply flex; }',
      sourceFile,
    }])
    expect(plan.hasUsableTailwindSource).toBe(true)
  })

  it('replaces configured temporary sources with the explicit root source', async () => {
    const configuredFile = '/repo/src/app.css'
    const configuredRootSource = {
      outputFile: 'app.wxss',
      rawSource: '@import "tailwindcss";',
      sourceFile: configuredFile,
    }
    const plan = await resolveRememberedCssSourcePlan(createOptions({
      configuredSourceFileKeys: new Set([configuredFile]),
      explicitConfiguredSourceFileKeys: new Set([configuredFile]),
      getRememberedCssSources: () => new Map([
        ['temporary', {
          outputFile: 'app.wxss',
          rawSource: '@import "tailwindcss";',
          sourceFile: configuredFile,
        }],
      ]),
      outputFile: 'app.wxss',
      resolveConfiguredRootSource: () => configuredRootSource,
      temporaryOutput: true,
    }))

    expect(plan).toEqual({
      forceNonMainChunk: false,
      hasUsableTailwindSource: true,
      outputFile: 'app.wxss',
      resolvedFromTemporarySource: false,
      sources: [configuredRootSource],
      usedConfiguredSourceFiles: [],
    })
  })

  it('resolves temporary generation sources into an explicit output plan', async () => {
    const temporarySource = {
      outputFile: 'subpackage/generated.wxss',
      rawSource: '@import "tailwindcss";\n@source "./pages/**/*.vue";',
      sourceFile: '/repo/src/subpackage/app.css',
    }
    const resolveTemporarySource = vi.fn(() => temporarySource)
    const plan = await resolveRememberedCssSourcePlan(createOptions({
      outputFile: 'app.css',
      rawSource: '@import "tailwindcss";',
      resolveMatchedOutputFile: () => 'subpackage/app.wxss',
      resolveTemporarySource,
      temporaryOutput: true,
    }))

    expect(resolveTemporarySource).toHaveBeenCalledWith('app.css', '@import "tailwindcss";')
    expect(plan).toEqual({
      forceNonMainChunk: true,
      hasUsableTailwindSource: true,
      outputFile: 'subpackage/app.wxss',
      resolvedFromTemporarySource: true,
      sources: [{
        ...temporarySource,
        outputFile: 'subpackage/app.wxss',
      }],
      usedConfiguredSourceFiles: ['/repo/src/subpackage/app.css'],
    })
  })
})

describe('vite css source plan', () => {
  function createCssSourceOptions(
    overrides: Partial<Parameters<typeof resolveViteCssSourcePlan>[0]> = {},
  ) {
    return {
      ...createOptions(),
      configuredEntries: [],
      cwd: '/repo/src',
      getSourceStyleSource: undefined,
      getSourceStyleSources: undefined,
      inferenceSourceRoot: '/repo/src',
      isConfiguredSourceProcessed: () => false,
      isConfiguredSourceUsed: () => false,
      isCurrentRootMiniProgramStyleOutput: false,
      projectRoot: '/repo',
      selectConfiguredRootSource: () => undefined,
      shouldKeepRootImportShell: () => false,
      ...overrides,
    }
  }

  it('selects a scoped configured source for a root style output', async () => {
    const sourceFile = '/repo/src/app.css'
    const plan = await resolveViteCssSourcePlan(createCssSourceOptions({
      configuredEntries: [{
        file: sourceFile,
        source: '@import "tailwindcss";\n@plugin "@tailwindcss/typography";',
      }],
      isCurrentRootMiniProgramStyleOutput: true,
      outputFile: 'app.wxss',
      rawSource: '/* generated shell */',
    }))

    expect(plan.resolution).toBe('configured')
    expect(plan.sources).toEqual([{
      outputFile: 'app.wxss',
      rawSource: '@import "tailwindcss";\n@plugin "@tailwindcss/typography";',
      sourceFile,
    }])
    expect(plan.usedConfiguredSourceFiles).toEqual([sourceFile])
  })

  it('resolves a source style from the compilation snapshot', async () => {
    const sourceFile = '/repo/src/pages/index/index.scss'
    const plan = await resolveViteCssSourcePlan(createCssSourceOptions({
      file: 'pages/index/index.css',
      getSourceStyleSource: file => file === sourceFile ? '.page { @apply flex; }' : undefined,
      outputFile: 'pages/index/index.css',
      snapshot: {
        entries: [{
          file: 'pages/index/index.js',
          output: {
            facadeModuleId: '/repo/src/pages/index/index.vue',
            fileName: 'pages/index/index.js',
            moduleIds: [sourceFile],
            modules: { [sourceFile]: {} },
            type: 'chunk',
          },
          source: '',
          type: 'js',
        }],
      } as any,
    }))

    expect(plan.resolution).toBe('inferred')
    expect(plan.sources).toEqual([{
      outputFile: 'pages/index/index.css',
      rawSource: '.page { @apply flex; }',
      sourceFile,
    }])
  })

  it('uses a remaining configured source for an anonymous temporary asset', async () => {
    const source = {
      outputFile: 'subpackage/app.wxss',
      rawSource: '@import "tailwindcss";',
      sourceFile: '/repo/src/subpackage/app.css',
    }
    const plan = await resolveViteCssSourcePlan(createCssSourceOptions({
      configuredEntries: [
        { file: '/repo/src/app.css', source: '@import "tailwindcss";' },
        { file: source.sourceFile, source: source.rawSource },
      ],
      outputFile: 'style.css',
      rawSource: '/* anonymous asset */',
      resolveMatchedOutputFile: () => source.outputFile,
      resolveTemporarySource: () => source,
      temporaryOutput: true,
    }))

    expect(plan.resolution).toBe('temporary')
    expect(plan.forceNonMainChunk).toBe(true)
    expect(plan.outputFile).toBe(source.outputFile)
    expect(plan.sources).toEqual([source])
  })

  it('matches an anonymous generated asset to an unused configured source', async () => {
    const sourceFile = '/repo/src/styles/tw-entry.vue'
    const source = '@import "tailwindcss" source(none);'
    const plan = await resolveViteCssSourcePlan(createCssSourceOptions({
      configuredEntries: [{ file: sourceFile, source }],
      originalSource: createAsset('styles/tw-entry.wxss'),
      outputFile: 'styles/tw-entry.wxss',
      rawSource: source,
      resolveMatchedOutputFile: () => 'app.wxss',
    }))

    expect(plan.resolution).toBe('configured')
    expect(plan.outputFile).toBe('app.wxss')
    expect(plan.sources).toEqual([{
      outputFile: 'app.wxss',
      rawSource: source,
      sourceFile,
    }])
  })

  it('does not treat an unresolved multi-entry temporary asset as anonymous', async () => {
    const plan = await resolveViteCssSourcePlan(createCssSourceOptions({
      configuredEntries: [
        { file: '/repo/src/main/app.css', source: '@import "tailwindcss";' },
        { file: '/repo/src/sub/app.css', source: '@import "tailwindcss";' },
      ],
      originalSource: createAsset('app.css'),
      outputFile: 'app.css',
      rawSource: '@import "tailwindcss";',
      resolveMatchedOutputFile: () => 'src/app.css',
      temporaryOutput: true,
    }))

    expect(plan.resolution).toBe('unresolved')
    expect(plan.outputFile).toBe('app.css')
    expect(plan.sources).toEqual([])
  })

  it('filters inferred fallback sources against the current explicit scan context', async () => {
    const plan = await resolveViteCssSourcePlan(createCssSourceOptions({
      currentRawSourceHasExplicitScanContext: true,
      getSourceStyleSources: () => new Map([
        ['/virtual/app.css', '@import "tailwindcss" source(none);'],
      ]),
      outputFile: 'app.css',
      rawSource: '@config "./tailwind.config.js";',
    }))

    expect(plan.resolution).toBe('inferred')
    expect(plan.hasUsableTailwindSource).toBe(false)
    expect(plan.sources).toEqual([])
  })
})

describe('vite css composition plan', () => {
  function createCompositionOptions(
    overrides: Partial<Parameters<typeof resolveViteCssCompositionPlan>[0]> = {},
  ) {
    return {
      assetSourceFile: 'pages/index/index.wxss',
      configuredSourceFileKeys: new Set<string>(),
      cssEntries: undefined,
      cssMatcher: (file: string) => file.endsWith('.wxss'),
      explicitSourceFileKeys: new Set<string>(),
      file: 'pages/index/index.wxss',
      getCssHandlerOptions: () => ({ isMainChunk: false }),
      getOriginalCssLayerSource: undefined,
      isRootStyleOutputFile: (file: string) => !file.includes('/') && file.endsWith('.wxss'),
      isWebGeneratorTarget: false,
      normalizeConfiguredSourceFile: (file: string) => file,
      normalizeGeneratorSource: (source: string) => source,
      normalizeGeneratorUserSource: (source: string) => source,
      outputCssHandlerOptions: { isMainChunk: false },
      outputFile: 'pages/index/index.wxss',
      rawSource: '.page{}',
      rememberedSources: [],
      resolveConfiguredRootInjectionTarget: () => undefined,
      resolveMatchedOutputFile: () => undefined,
      resolvedFromTemporarySource: false,
      rootImportShellOutputFile: 'app.wxss',
      shouldKeepImportedCssShell: false,
      shouldKeepRootImportShell: false,
      shouldMoveRootImportShellToOrigin: false,
      shouldSkipRememberedSource: () => false,
      viteProcessedCssAsset: false,
      ...overrides,
    }
  }

  it('preserves a pure imported css shell without entering generation', () => {
    const plan = resolveViteCssCompositionPlan(createCompositionOptions({
      rawSource: '@import "./shared.wxss";',
      shouldKeepImportedCssShell: true,
    }))

    expect(plan.preserveImportedCssShell).toBe(true)
    expect(plan.vitePipelineCssAsset).toBe(false)
  })

  it('composes remembered configured sources into one generator input', () => {
    const sourceFile = '/repo/src/sub/app.css'
    const plan = resolveViteCssCompositionPlan(createCompositionOptions({
      configuredSourceFileKeys: new Set([sourceFile]),
      explicitSourceFileKeys: new Set([sourceFile]),
      getCssHandlerOptions: () => ({ isMainChunk: false }),
      outputFile: 'temporary.css',
      rememberedSources: [{
        outputFile: 'temporary.css',
        rawSource: '@import "tailwindcss";\n@source "./pages/**/*.vue";',
        sourceFile,
      }],
      resolveMatchedOutputFile: () => 'sub/app.wxss',
      viteProcessedCssAsset: true,
    }))

    expect(plan.outputFile).toBe('sub/app.wxss')
    expect(plan.generatorSourceFile).toBe(sourceFile)
    expect(plan.generatorCssHandlerOptions.sourceOptions).toEqual({
      cssEntries: [sourceFile],
      sourceFile,
    })
    expect(plan.usedConfiguredSourceFile).toBe(sourceFile)
  })
})
