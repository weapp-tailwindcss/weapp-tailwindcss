import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCssAssetEmitter } from '@/bundlers/vite/generate-bundle/css-assets'
import { createViteCssAssetIdentityResolver } from '@/bundlers/vite/css-asset-identity'
import {
  applyCssResultToBundle,
  createMatchedCssSourceOutputResolver,
  hasViteProcessedCssResultForSource,
  resolveCssAssetOutputPlan,
  resolveCssBundleOutputFile,
  resolveOutputFileFromMatchedCssSource,
  shouldSkipRawSourceStyleAsset,
} from '@/bundlers/vite/generate-bundle/css-output-helpers'
import {
  createCssImportShell,
  createRelativeCssImportRequest,
  createRootMiniProgramOriginStyleOutputFile,
  isRootMiniProgramStyleOutputFile,
  linkFrameworkRootStyleToRuntimeEntry,
  restoreFrameworkRootMiniProgramImportShellAssets,
  resolveFrameworkRootImportShellPlan,
  shouldKeepRootMiniProgramStyleAsImportShell,
  shouldMoveRootMiniProgramStyleToImportShellOrigin,
  shouldPreserveFrameworkRootMiniProgramImportShell,
} from '@/bundlers/vite/generate-bundle/root-style-output'
import { resolveCurrentSourceCandidateFile, resolveCurrentSourceCandidateSource } from '@/bundlers/vite/generate-bundle/source-candidate-source'
import { scoreTailwindV4CssSourceFileMatch } from '@/generation/source-resolver/matching'
import { resolveSourceStyleSourceFromOutputFile } from '@/bundlers/vite/generate-bundle/sfc-style-source'
import {
  collectTailwindV4SourceFingerprint,
  scoreConfiguredTailwindV4SourceForRawSource,
  selectTailwindV4GenerationCssSourceForOutput,
} from '@/bundlers/vite/generate-bundle/tailwind-v4-css-source'
import {
  collectTemporaryCssSourceEntries,
  createTemporaryCssAssetSourceResolver,
  isTemporaryCssAssetFile,
} from '@/bundlers/vite/generate-bundle/temporary-css-assets'
import {
  isMissingInternalCssSource,
  normalizeVitePersistentCacheKey,
  summarizeStringCache,
  summarizeViteProcessedCssResults,
  toMb,
} from '@/bundlers/vite/plugin-cache'
import { taroCssPipelineStrategy } from '@/bundlers/vite/frameworks/taro'
import { uniAppCssPipelineStrategy } from '@/bundlers/vite/frameworks/uni-app'
import { uniAppXCssPipelineStrategy } from '@/bundlers/vite/frameworks/uni-app-x'
import { resolveViteServeRootMiniProgramImportShell } from '@/bundlers/vite/serve-root-import-shell'

let tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map(root => rm(root, { force: true, recursive: true })))
  tempRoots = []
})

async function createTempRoot() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'weapp-tw-vite-helpers-'))
  tempRoots.push(root)
  return root
}

function createAsset(source: string, originalFileNames?: string[]) {
  return {
    type: 'asset' as const,
    fileName: 'style.wxss',
    source,
    originalFileNames,
  }
}

describe('bundlers/vite helper modules', () => {
  it('resolves css asset identity only from structured ownership metadata', () => {
    const resolveIdentity = createViteCssAssetIdentityResolver({
      generatorPlaceholderFile: '/repo/pkg/generator-placeholder.css',
      isKnownProcessedSource: file => file === '/repo/src/generated.css',
    })
    expect(resolveIdentity(createAsset('page{}', [
      '/repo/pkg/generator-placeholder.css?used',
    ]) as any)).toEqual({
      kind: 'generator-placeholder',
      sourceFile: '/repo/pkg/generator-placeholder.css?used',
    })
    expect(resolveIdentity(createAsset('page{}', [
      '/repo/src/generated.css',
    ]) as any)).toEqual({
      kind: 'bundler-generated',
      sourceFile: '/repo/src/generated.css',
    })
    expect(resolveIdentity(createAsset('/* vite-placeholder */') as any)).toEqual({
      kind: 'user',
    })
    expect(resolveIdentity(createAsset('/*! weapp-tailwindcss generator-placeholder */') as any)).toEqual({
      kind: 'user',
    })
    expect(resolveIdentity(createAsset('/*! weapp-tailwindcss generated-css vite */') as any)).toEqual({
      kind: 'user',
    })
    expect(resolveIdentity(createAsset('page{}') as any)).toEqual({
      kind: 'user',
    })
  })
  it('summarizes vite cache state and detects missing internal css sources', async () => {
    const root = await createTempRoot()
    const pkg = path.join(root, 'pkg')
    await mkdir(pkg)
    const existing = path.join(pkg, 'index.css')
    await writeFile(existing, '.a{}')

    expect(normalizeVitePersistentCacheKey('a\\b.css')).toBe('a/b.css')
    expect(toMb(1024 * 1024 * 1.6)).toBe(2)
    expect(summarizeStringCache(new Map([['a', '123'], ['b', '45']]))).toEqual({ bytes: 5, mb: 0, size: 2 })
    expect(summarizeViteProcessedCssResults(new Map([['a', { css: '1234' }]]))).toEqual({ bytes: 4, mb: 0, size: 1 })
    expect(isMissingInternalCssSource(path.join(pkg, 'missing.css'), pkg)).toBe(true)
    expect(isMissingInternalCssSource(existing, pkg)).toBe(false)
    expect(isMissingInternalCssSource(path.join(root, 'outside.css'), pkg)).toBe(false)
  })

  it('handles root mini-program style output and import shells', () => {
    expect(isRootMiniProgramStyleOutputFile('app.wxss?inline')).toBe(true)
    expect(isRootMiniProgramStyleOutputFile('pages/index.wxss')).toBe(false)
    expect(createRelativeCssImportRequest('app.wxss', 'app-origin.wxss')).toBe('./app-origin.wxss')
    expect(createRelativeCssImportRequest('pages/index.wxss', 'common/app.wxss')).toBe('../common/app.wxss')
    expect(createCssImportShell('pages/index.wxss', 'common/app.wxss')).toBe('@import "../common/app.wxss";\n')
    expect(createRootMiniProgramOriginStyleOutputFile('app.wxss')).toBe('app-origin.wxss')
    expect(createRootMiniProgramOriginStyleOutputFile('app-origin.wxss')).toBe('app-origin.wxss')
    expect(shouldKeepRootMiniProgramStyleAsImportShell(true)).toBe(true)
    expect(shouldKeepRootMiniProgramStyleAsImportShell(false)).toBe(false)
    expect(shouldKeepRootMiniProgramStyleAsImportShell(undefined)).toBe(false)
    expect(shouldMoveRootMiniProgramStyleToImportShellOrigin(true)).toBe(true)
    expect(shouldMoveRootMiniProgramStyleToImportShellOrigin(false)).toBe(false)
    expect(shouldPreserveFrameworkRootMiniProgramImportShell({
      css: '@import "./main.acss";',
      file: 'app.acss',
      isWebGeneratorTarget: false,
      matchesCss: true,
      shouldKeep: () => true,
    })).toBe(true)
    expect(shouldPreserveFrameworkRootMiniProgramImportShell({
      css: '@import "./main.acss";',
      file: 'pages/app.acss',
      isWebGeneratorTarget: false,
      matchesCss: true,
      shouldKeep: () => true,
    })).toBe(false)
    expect(shouldPreserveFrameworkRootMiniProgramImportShell({
      css: '@import "./main.acss";\npage{}',
      file: 'app.acss',
      isWebGeneratorTarget: false,
      matchesCss: true,
      shouldKeep: () => true,
    })).toBe(false)
  })

  it('plans css asset output from root ownership and configured originals', () => {
    const rootPlan = resolveCssAssetOutputPlan({
      assetSourceFile: 'entry.acss',
      bundleFiles: ['entry.acss', 'generated.acss'],
      configuredEntries: [],
      defaultStyleOutputExtension: '.acss',
      file: 'entry.acss',
      isWebGeneratorTarget: false,
      normalizeConfiguredSourceFile: file => file,
      opts: {
        cssMatcher: file => file.endsWith('.acss'),
      } as any,
      originalFileNames: [],
      pipelineContext: {} as any,
      resolveOutputFileFromMatchedCssSource: () => undefined,
      rootImportShellOutputFile: 'entry.acss',
      rootImportShellTarget: 'generated.acss',
      shouldPreserveAppCssExtension: false,
      shouldReuseRootImportShell: () => true,
    })
    expect(rootPlan.outputFile).toBe('generated.acss')
    expect(rootPlan.resolvedFromConfiguredOriginalCssEntry).toBe(false)
    expect(rootPlan.reusedRootImportShellTarget).toBe(true)

    const configuredPlan = resolveCssAssetOutputPlan({
      assetSourceFile: '/repo/src/app.css',
      bundleFiles: ['bundle.css'],
      configuredEntries: [{ file: '/repo/src/app.css' }],
      defaultStyleOutputExtension: '.css',
      file: 'bundle.css',
      isWebGeneratorTarget: false,
      normalizeConfiguredSourceFile: file => file,
      opts: {
        cssMatcher: file => file.endsWith('.css'),
      } as any,
      originalFileNames: ['/repo/src/app.css'],
      pipelineContext: {} as any,
      resolveOutputFileFromMatchedCssSource: () => 'app.css',
      rootImportShellOutputFile: 'bundle.css',
      rootImportShellTarget: undefined,
      shouldPreserveAppCssExtension: false,
      shouldReuseRootImportShell: () => false,
    })
    expect(configuredPlan.outputFile).toBe('app.css')
    expect(configuredPlan.resolvedFromConfiguredOriginalCssEntry).toBe(true)
    expect(configuredPlan.reusedRootImportShellTarget).toBe(false)
  })

  it('restores framework root import shells through the real output asset', () => {
    const output = {
      type: 'asset' as const,
      fileName: 'entry.acss',
      source: '.root{color:red}',
    }
    const bundle = {
      'entry-hash.acss': output,
    }

    expect(restoreFrameworkRootMiniProgramImportShellAssets(bundle as any, {
      isWebGeneratorTarget: false,
      matchesCss: file => file.endsWith('.acss'),
      shouldKeep: () => true,
      targetByFile: new Map([
        ['entry.acss', 'generated.acss'],
      ]),
    })).toBe(1)

    expect(bundle['entry-hash.acss']).toBe(output)
    expect(output.source).toBe('@import "./generated.acss";\n')
  })

  it('links a framework root style shell from the runtime root style asset', () => {
    const runtimeStyle = {
      type: 'asset' as const,
      fileName: 'entry.acss',
      source: '.runtime{color:red}',
    }
    const bundle = {
      'entry.js': {
        type: 'chunk' as const,
        fileName: 'entry.js',
        code: '',
      },
      'entry.acss': runtimeStyle,
      'framework.acss': {
        type: 'asset' as const,
        fileName: 'framework.acss',
        source: '@import "./generated.acss";',
      },
    }

    expect(linkFrameworkRootStyleToRuntimeEntry(bundle as any, {
      matchesCss: file => file.endsWith('.acss'),
      targetByFile: new Map([
        ['framework.acss', 'generated.acss'],
      ]),
    })).toBe(1)

    expect(runtimeStyle.source).toBe('@import "./framework.acss";\n.runtime{color:red}')
  })

  it('does not link an ambiguous or cyclic framework root style graph', () => {
    const createBundle = (frameworkSource: string) => ({
      'entry.js': {
        type: 'chunk' as const,
        fileName: 'entry.js',
        code: '',
      },
      'entry.acss': {
        type: 'asset' as const,
        fileName: 'entry.acss',
        source: '.runtime{color:red}',
      },
      'framework.acss': {
        type: 'asset' as const,
        fileName: 'framework.acss',
        source: frameworkSource,
      },
    })

    expect(linkFrameworkRootStyleToRuntimeEntry(createBundle('@import "./entry.acss";') as any, {
      matchesCss: file => file.endsWith('.acss'),
      targetByFile: new Map([
        ['framework.acss', 'generated.acss'],
      ]),
    })).toBe(0)

    expect(linkFrameworkRootStyleToRuntimeEntry(createBundle('@import "./generated.acss";') as any, {
      matchesCss: file => file.endsWith('.acss'),
      targetByFile: new Map([
        ['framework.acss', 'generated.acss'],
        ['other.acss', 'other-generated.acss'],
      ]),
    })).toBe(0)
  })

  it('plans framework root import shell ownership without mutating runtime state', () => {
    expect(resolveFrameworkRootImportShellPlan({
      assetSourceFile: 'entry.acss',
      configuredTargetFiles: [],
      file: 'entry.acss',
      isMainChunk: true,
      isWebGeneratorTarget: false,
      matchesCss: true,
      processedTargetFiles: [],
      rawSource: '@import "./generated.acss";',
      rememberedTarget: undefined,
      rootImportShellOutputFile: 'entry.acss',
      shouldKeep: () => true,
      shouldMoveToOrigin: () => false,
    })).toEqual({
      isCurrentImportShell: true,
      reusableTarget: undefined,
      targetToRemember: 'generated.acss',
    })

    expect(resolveFrameworkRootImportShellPlan({
      assetSourceFile: 'entry.acss',
      configuredTargetFiles: ['generated.acss'],
      file: 'entry.acss',
      isMainChunk: true,
      isWebGeneratorTarget: false,
      matchesCss: true,
      processedTargetFiles: ['generated.acss'],
      rawSource: 'page{}',
      rememberedTarget: undefined,
      rootImportShellOutputFile: 'entry.acss',
      shouldKeep: () => true,
      shouldMoveToOrigin: () => false,
    })).toEqual({
      isCurrentImportShell: false,
      reusableTarget: 'generated.acss',
      targetToRemember: 'generated.acss',
    })

    expect(resolveFrameworkRootImportShellPlan({
      assetSourceFile: 'entry.acss',
      configuredTargetFiles: ['first.acss', 'second.acss'],
      file: 'entry.acss',
      isMainChunk: true,
      isWebGeneratorTarget: false,
      matchesCss: true,
      processedTargetFiles: [],
      rawSource: 'page{}',
      rememberedTarget: undefined,
      rootImportShellOutputFile: 'entry.acss',
      shouldKeep: () => true,
      shouldMoveToOrigin: () => false,
    }).reusableTarget).toBeUndefined()
  })

  it('preserves vite serve root mini-program import shells for framework-owned shell policies only', () => {
    const frameworkStrategies = {
      'taro': taroCssPipelineStrategy,
      'uni-app-vite': uniAppCssPipelineStrategy,
      'uni-app-x': uniAppXCssPipelineStrategy,
    }
    const preservedShells = Object.fromEntries(Object.entries(frameworkStrategies).map(([framework, cssPipelineStrategy]) => [
      framework,
      resolveViteServeRootMiniProgramImportShell({
        css: '@import "tailwind.wxss";',
        cssPipelineContext: {} as any,
        cssPipelineStrategy,
        isWebGeneratorTarget: false,
        outputFile: 'app.wxss',
      }),
    ]))

    expect(preservedShells).toMatchInlineSnapshot(`
      {
        "taro": "@import "./tailwind.wxss";",
        "uni-app-vite": "@import "./tailwind.wxss";",
        "uni-app-x": "@import "./tailwind.wxss";",
      }
    `)

    const baseOptions = {
      css: '@import "tailwind.wxss";',
      cssPipelineContext: {} as any,
      cssPipelineStrategy: {
        shouldKeepRootMiniProgramStyleAsImportShell: vi.fn(() => true),
      },
      isWebGeneratorTarget: false,
      outputFile: 'app.wxss',
    }

    expect(resolveViteServeRootMiniProgramImportShell(baseOptions)).toBe('@import "./tailwind.wxss";')
    expect(baseOptions.cssPipelineStrategy.shouldKeepRootMiniProgramStyleAsImportShell).toHaveBeenCalledWith(expect.objectContaining({
      css: '@import "tailwind.wxss";',
      file: 'app.wxss',
    }))
    expect(resolveViteServeRootMiniProgramImportShell({
      ...baseOptions,
      css: '@import "tailwind.wxss";\n.root{}',
    })).toBeUndefined()
    expect(resolveViteServeRootMiniProgramImportShell({
      ...baseOptions,
      isWebGeneratorTarget: true,
    })).toBeUndefined()
    expect(resolveViteServeRootMiniProgramImportShell({
      ...baseOptions,
      outputFile: 'pages/index.wxss',
    })).toBeUndefined()
    expect(resolveViteServeRootMiniProgramImportShell({
      ...baseOptions,
      cssPipelineStrategy: {
        shouldKeepRootMiniProgramStyleAsImportShell: () => false,
      },
    })).toBeUndefined()
  })

  it('infers uni-app x native targets from the bundler output directory', () => {
    const originalPlatform = process.env.UNI_UTS_PLATFORM
    delete process.env.UNI_UTS_PLATFORM
    try {
      const context = {
        resolvedConfig: {
          build: {
            outDir: '/project/unpackage/dist/dev/.uvue',
          },
          root: '/tmp/project-weapp-tw-app-android-12345',
        },
      } as any

      expect(uniAppXCssPipelineStrategy.isNativeAppStyleTarget?.(context)).toBe(true)
      expect(uniAppXCssPipelineStrategy.shouldPreserveStyleOutputExtension?.(context)).toBe(true)
    }
    finally {
      process.env.UNI_UTS_PLATFORM = originalPlatform
    }
  })

  it('resolves current source candidate source by explicit and scored candidates', () => {
    const rootDir = '/repo'
    const outDir = '/repo/dist'
    const sourceRoot = '/repo/src'
    const explicit = resolveCurrentSourceCandidateSource({
      file: 'pages/index/index.wxml?used',
      rootDir,
      outDir,
      sourceRoot,
      getSourceCandidateSource: file => file === '/repo/src/pages/index/index.wxml?used' ? 'explicit' : undefined,
    })
    expect(explicit).toBe('explicit')
    expect(resolveCurrentSourceCandidateFile({
      file: 'pages/index/index.wxml?used',
      rootDir,
      outDir,
      sourceRoot,
      getSourceCandidateSource: file => file === '/repo/src/pages/index/index.wxml?used' ? 'explicit' : undefined,
    })).toBe('/repo/src/pages/index/index.wxml?used')

    const scored = resolveCurrentSourceCandidateSource({
      file: 'pages/index/index.wxml',
      rootDir,
      outDir,
      getSourceCandidateSources: () => new Map([
        ['/repo/other/pages/index/index.wxml', 'suffix'],
        ['/repo/dist/pages/index/index.wxml', 'exact'],
      ]),
    })
    expect(scored).toBe('exact')
    expect(resolveCurrentSourceCandidateFile({
      file: 'pages/index/index.wxml',
      rootDir,
      outDir,
      getSourceCandidateSources: () => new Map([
        ['/repo/other/pages/index/index.wxml', 'suffix'],
        ['/repo/dist/pages/index/index.wxml', 'exact'],
      ]),
    })).toBe('/repo/dist/pages/index/index.wxml')
    const relativeExact = resolveCurrentSourceCandidateSource({
      file: 'relative.wxml',
      rootDir,
      outDir,
      getSourceCandidateSources: () => new Map([
        [path.resolve('relative.wxml'), 'relative-exact'],
      ]),
    })
    expect(relativeExact).toBe('relative-exact')
    expect(resolveCurrentSourceCandidateSource({ file: '/repo/src/absolute.wxml', rootDir, outDir })).toBeUndefined()
    expect(resolveCurrentSourceCandidateSource({
      file: '/repo/dist/pages/from-out-dir.wxml',
      rootDir,
      outDir,
      getSourceCandidateSources: () => [],
    })).toBeUndefined()
    const suffixOnly = resolveCurrentSourceCandidateSource({
      file: 'pages/index/index.wxml',
      rootDir,
      outDir,
      getSourceCandidateSources: () => new Map([
        ['/repo/other/pages/index/index.wxml', 'suffix'],
      ]),
    })
    expect(suffixOnly).toBe('suffix')
    const filenameFallback = resolveCurrentSourceCandidateSource({
      file: 'index.wxml',
      rootDir,
      outDir,
      getSourceCandidateSources: () => new Map([
        ['/repo/pages/other.wxml', 'not-matched'],
        ['/repo/pages/index.wxml', 'filename-fallback'],
        ['/repo/another/index.wxml', 'same-score-fallback'],
      ]),
    })
    expect(filenameFallback).toBe('filename-fallback')
    const missing = resolveCurrentSourceCandidateSource({
      file: 'pages/missing.wxml',
      rootDir,
      outDir,
      getSourceCandidateSources: () => [],
    })
    expect(missing).toBeUndefined()
  })

  it('selects configured Tailwind v4 css sources by fingerprint and subpackage scope', () => {
    const main = {
      file: 'app.css',
      source: '@import "tailwindcss"; @config "./tailwind.config.js"; @theme { --color-main: red; } .main-card{}',
    }
    const mainImplicit = {
      file: 'implicit.css',
      source: '@import "tailwindcss"; .implicit-card{}',
    }
    const mainExplicit = {
      file: 'explicit.css',
      source: '@import "tailwindcss"; @source "./src/**/*"; .explicit-card{}',
    }
    const sub = {
      file: 'sub/pages/index.css',
      source: '@import "tailwindcss"; @source "./**/*.vue"; @theme { --color-sub: blue; } .sub-card{}',
    }
    const subOther = {
      file: 'other/pages/index.css',
      source: '@import "tailwindcss"; @source "./**/*.vue"; .other-card{}',
    }
    const empty = { file: 'plain.css', source: '.plain{}' }

    const fingerprint = collectTailwindV4SourceFingerprint(`${main.source} @source not "./legacy"; @source inline("{hover:,focus:,}bg-red-500"); @source not inline("legacy-token"); @import "tailwindcss" source(none); @plugin '@iconify/tailwind4' { prefix: 'i'; scale: 1.2; } @custom-variant hocus { &:hover { @slot; } } @utility content-auto { content-visibility:auto; }`)
    expect([...fingerprint]).toContain('config:tailwind.config.js')
    expect([...fingerprint]).toContain('source:not:./legacy')
    expect([...fingerprint]).toContain('source:inline:"{hover:,focus:,}bg-red-500"')
    expect([...fingerprint]).toContain('source:inline:not:"legacy-token"')
    expect([...fingerprint]).toContain('import-source:none')
    expect([...fingerprint]).toContain('plugin:@iconify/tailwind4')
    expect([...fingerprint]).toContain('plugin-option:@iconify/tailwind4:prefix:\'i\'')
    expect([...fingerprint]).toContain('plugin-option:@iconify/tailwind4:scale:1.2')
    const iconifyOptionFingerprint = collectTailwindV4SourceFingerprint([
      "@plugin '@iconify/tailwind4' {",
      '  prefixes: tst;',
      '  icon-selector: ".ic-{prefix}-{name}";',
      '  mask-selector: ".mask-icon";',
      '  background-selector: ".bg-icon";',
      '  var-name: "icon";',
      '  square: false;',
      '  icon-sets: from-json(tst, "./icons.json");',
      '}',
    ].join('\n'))
    expect([...iconifyOptionFingerprint]).toContain('plugin-option:@iconify/tailwind4:prefixes:tst')
    expect([...iconifyOptionFingerprint]).toContain('plugin-option:@iconify/tailwind4:icon-selector:".ic-{prefix}-{name}"')
    expect([...iconifyOptionFingerprint]).toContain('plugin-option:@iconify/tailwind4:mask-selector:".mask-icon"')
    expect([...iconifyOptionFingerprint]).toContain('plugin-option:@iconify/tailwind4:background-selector:".bg-icon"')
    expect([...iconifyOptionFingerprint]).toContain('plugin-option:@iconify/tailwind4:var-name:"icon"')
    expect([...iconifyOptionFingerprint]).toContain('plugin-option:@iconify/tailwind4:square:false')
    expect([...iconifyOptionFingerprint]).toContain('plugin-option:@iconify/tailwind4:icon-sets:from-json(tst, "./icons.json")')
    expect([...fingerprint]).toContain('custom-variant:hocus')
    expect([...fingerprint]).toContain('directive:content-auto')
    expect(scoreConfiguredTailwindV4SourceForRawSource(undefined, main.source)).toBe(0)
    expect(scoreConfiguredTailwindV4SourceForRawSource('.none{}', main.source)).toBe(0)
    expect(scoreConfiguredTailwindV4SourceForRawSource(main.source, main.source)).toBeGreaterThan(100)
    expect(selectTailwindV4GenerationCssSourceForOutput('app.wxss', [empty])).toBeUndefined()
    expect(selectTailwindV4GenerationCssSourceForOutput('app.wxss', [main])).toBe(main)
    expect(selectTailwindV4GenerationCssSourceForOutput('app.wxss', [main, empty], undefined)).toBe(main)
    expect(selectTailwindV4GenerationCssSourceForOutput('app.wxss', [main, sub], main.source)).toBe(main)
    expect(selectTailwindV4GenerationCssSourceForOutput('app.wxss', [main, sub], `${main.source}\n${sub.source}`)).toBe(main)
    expect(selectTailwindV4GenerationCssSourceForOutput('app.wxss', [mainImplicit, mainExplicit], undefined)).toBe(mainExplicit)
    expect(selectTailwindV4GenerationCssSourceForOutput('sub/pages/index.wxss', [sub, subOther], undefined)).toBeUndefined()
    expect(selectTailwindV4GenerationCssSourceForOutput('sub/pages/index.wxss', [sub, subOther], subOther.source)).toBe(subOther)
    expect(selectTailwindV4GenerationCssSourceForOutput('app.wxss', [main, sub], '@import "tailwindcss";')).toBeUndefined()
    expect(selectTailwindV4GenerationCssSourceForOutput('app.wxss', [mainImplicit, subOther], undefined)).toBe(subOther)
    const root = path.join(os.tmpdir(), 'weapp-tw-vite-css-source-select')
    const normalEntry = {
      file: path.join(root, 'src/feature-a/pages/index.css'),
      source: '@import "tailwindcss" source(none); @source "./**/*.{wxml,js,ts}";',
    }
    const otherEntry = {
      file: path.join(root, 'src/feature-b/pages/index.css'),
      source: normalEntry.source,
    }
    expect(selectTailwindV4GenerationCssSourceForOutput(
      'feature-a/pages/index.wxss',
      [otherEntry, normalEntry],
      undefined,
      {
        outputRoot: path.join(root, 'dist'),
        projectRoot: path.join(root, 'src'),
      },
    )).toBe(normalEntry)
    const mainEntry = {
      file: path.join(root, 'src/main.css'),
      source: '@import "tailwindcss" source(none); @source "../src/**/*.{vue,js,ts}";',
    }
    const pageOrderEntry = {
      file: path.join(root, 'src/pages-order/index.css'),
      source: '@import "tailwindcss" source(none); @source "./**/*.{vue,js,ts}";',
    }
    expect(selectTailwindV4GenerationCssSourceForOutput(
      'pages-order/pages/user/user.css',
      [mainEntry, pageOrderEntry],
      undefined,
      {
        outputRoot: path.join(root, 'dist/build/app'),
        projectRoot: root,
      },
    )).toBe(pageOrderEntry)
    expect(selectTailwindV4GenerationCssSourceForOutput(
      'pages-order/pages/user/user.css',
      [mainEntry, pageOrderEntry],
      `${mainEntry.source}\n${pageOrderEntry.source}\n@theme { --color-main-only: red; }`,
      {
        outputRoot: path.join(root, 'dist/build/app'),
        projectRoot: root,
      },
    )).toBe(pageOrderEntry)
  })

  it('resolves temporary root css assets to remaining scoped Tailwind v4 css entries', () => {
    const resolver = createTemporaryCssAssetSourceResolver([
      {
        file: '/repo/src/app.css',
        outputFile: 'app-origin.acss',
        source: '@import "tailwindcss"; @source "./pages/**/*.tsx";',
      },
      {
        file: '/repo/src/sub-normal/pages/index.css',
        outputFile: 'sub-normal/pages/index.acss',
        source: '@import "tailwindcss"; @source "./**/*.tsx";',
      },
      {
        file: '/repo/src/sub-independent/pages/index.css',
        outputFile: 'sub-independent/pages/index.acss',
        source: '@import "tailwindcss"; @source "./**/*.tsx";',
      },
    ])

    expect(isTemporaryCssAssetFile('index.css')).toBe(true)
    expect(isTemporaryCssAssetFile('pages/index.css')).toBe(false)
    expect(isTemporaryCssAssetFile('app.acss')).toBe(false)

    resolver.markUsed('/repo/src/sub-normal/pages/index.css')

    expect(resolver.resolve('index.css')).toEqual({
      outputFile: 'sub-independent/pages/index.acss',
      rawSource: '@import "tailwindcss"; @source "./**/*.tsx";',
      sourceFile: '/repo/src/sub-independent/pages/index.css',
    })
    expect(resolver.resolve('index2.css')).toBeUndefined()

    const outOfOrderResolver = createTemporaryCssAssetSourceResolver([
      {
        file: '/repo/src/pages/index/index.css',
        outputFile: 'pages/index/index.acss',
        source: '@import "tailwindcss"; @source "./index.css"; .issue-951-page-local { color: #111827; }',
      },
      {
        file: '/repo/src/sub-normal/pages/index.css',
        outputFile: 'sub-normal/pages/index.acss',
        source: '@import "tailwindcss"; @source "./index.css"; .issue-951-normal-local { color: #7c3aed; }',
      },
      {
        file: '/repo/src/sub-independent/pages/index.css',
        outputFile: 'sub-independent/pages/index.acss',
        source: '@import "tailwindcss"; @source "./index.css"; .issue-951-independent-local { color: #059669; }',
      },
    ])
    expect(outOfOrderResolver.resolve('index.css', '.issue-951-independent-local{color:#059669}')).toEqual({
      outputFile: 'sub-independent/pages/index.acss',
      rawSource: '@import "tailwindcss"; @source "./index.css"; .issue-951-independent-local { color: #059669; }',
      sourceFile: '/repo/src/sub-independent/pages/index.css',
    })
    expect(outOfOrderResolver.resolve('index2.css', '.issue-951-page-local{color:#111827}')).toEqual({
      outputFile: 'pages/index/index.acss',
      rawSource: '@import "tailwindcss"; @source "./index.css"; .issue-951-page-local { color: #111827; }',
      sourceFile: '/repo/src/pages/index/index.css',
    })
    expect(outOfOrderResolver.resolve('vendors.css', '.nut-icon{display:inline-block}')).toBeUndefined()
  })

  it('collects temporary css sources from lifecycle and configured ownership', () => {
    const entries = collectTemporaryCssSourceEntries({
      configuredEntries: [
        { file: '/repo/src/app.css', outputFile: 'app.acss', source: 'app' },
        { file: '/repo/src/pages/a.css', outputFile: 'pages/a.acss', source: 'page' },
      ],
      configuredScopeEntries: [
        { file: '/repo/src/sub/a.css', outputFile: 'sub/a.acss', source: 'sub' },
      ],
      currentSubpackageRoots: ['sub'],
      explicitSourceFileKeys: new Set(['/repo/src/app.css']),
      isSubpackageOutputFile: (file, roots) => roots.some(root => file.startsWith(`${root}/`)),
      normalizeConfiguredSourceFile: file => file,
      rememberedEntries: [
        { file: '/repo/src/remembered.css', outputFile: 'pages/remembered.acss', source: 'remembered' },
      ],
      resolveRuntimeLinkedSource: file => ({
        file: `/repo/src/${file}`,
        outputFile: file,
        source: 'runtime',
      }),
      runtimeLinkedCssFiles: ['pages/runtime.acss'],
      shouldSelectConfiguredRootOutput: file => file === 'app.acss',
    })

    expect(entries.map(entry => entry.source)).toEqual([
      'runtime',
      'remembered',
      'app',
      'page',
      'sub',
    ])
  })

  it('resolves page css output from the single css module imported by its sibling chunk', () => {
    const root = '/repo/demo'
    const sourceFile = path.join(root, 'src/pages-order/order-shared.css')
    const source = '@import "tailwindcss" source(none);\n@config "../../tailwind.config.order.js";\n@source "./**/*.{vue,js,ts}";'
    const snapshot = {
      entries: [
        {
          type: 'js',
          file: 'pages-order/pages/user/user.js',
          output: {
            type: 'chunk',
            facadeModuleId: path.join(root, 'src/pages-order/pages/user/user.vue'),
            moduleIds: [
              path.join(root, 'src/pages-order/pages/user/user.vue'),
              sourceFile,
            ],
            modules: {},
          },
        },
      ],
    } as any

    expect(resolveSourceStyleSourceFromOutputFile(
      'pages-order/pages/user/user.css',
      snapshot,
      path.join(root, 'dist/build/app'),
      path.join(root, 'src'),
      file => (file === sourceFile ? source : undefined),
      undefined,
      undefined,
      vi.fn(),
    )).toEqual({
      outputFile: 'pages-order/pages/user/user.css',
      rawSource: source,
      sourceFile,
    })
  })

  it('matches app style assets to cached directory index Tailwind v4 css sources', () => {
    const root = '/repo/demo'
    const mainSource = '@import "tailwindcss" source(none);\n@source "../src/**/*.{vue,js,ts}";'
    const pageOrderSource = '@import "tailwindcss" source(none);\n@config "../../tailwind.config.order.js";\n@source "./**/*.{vue,js,ts}";'

    expect(resolveSourceStyleSourceFromOutputFile(
      'pages-order/pages/user/user.css',
      { entries: [] } as any,
      path.join(root, 'dist/build/app'),
      path.join(root, 'src'),
      undefined,
      () => new Map([
        [path.join(root, 'src/main.css'), mainSource],
        [path.join(root, 'src/pages-order/index.css'), pageOrderSource],
      ]),
      undefined,
      vi.fn(),
    )).toEqual({
      outputFile: 'pages-order/pages/user/user.css',
      rawSource: pageOrderSource,
      sourceFile: path.join(root, 'src/pages-order/index.css'),
    })
  })

  it('does not match flat hashed index assets to arbitrary directory index css sources', () => {
    const root = '/repo/demo'

    expect(scoreTailwindV4CssSourceFileMatch(
      'assets/index-A1B2C3.css',
      path.join(root, 'src/sub/index.css'),
      {
        outputRoot: path.join(root, 'dist/build/h5'),
        projectRoot: root,
        cwd: root,
      },
    )).toBe(0)
    expect(scoreTailwindV4CssSourceFileMatch(
      'pages-order/pages/user/user.css',
      path.join(root, 'src/pages-order/index.css'),
      {
        outputRoot: path.join(root, 'dist/build/app'),
        projectRoot: root,
        cwd: root,
      },
    )).toBeGreaterThan(0)
  })

  it('resolves matched css outputs and applies css results back to bundle assets', () => {
    const opts = {
      appType: 'taro',
      cssMatcher: (file: string) => file.endsWith('.wxss'),
      platform: 'weapp',
    } as any
    const pipelineContext = {} as any
    const taroRootStyleStrategy = {
      shouldKeepRootMiniProgramStyleAsImportShell: () => true,
      shouldMoveRootMiniProgramStyleToImportShellOrigin: () => true,
    }
    expect(resolveCssBundleOutputFile({
      bundleFiles: ['app.wxss'],
      cssPipelineStrategy: taroRootStyleStrategy,
      defaultStyleOutputExtension: '.wxss',
      file: 'app.scss',
      isWebGeneratorTarget: false,
      opts,
      pipelineContext,
      shouldPreserveAppCssExtension: false,
    })).toBe('app.wxss')
    expect(resolveCssBundleOutputFile({
      bundleFiles: ['app.wxss'],
      cssPipelineStrategy: taroRootStyleStrategy,
      defaultStyleOutputExtension: '.wxss',
      file: 'app.wxss',
      isWebGeneratorTarget: false,
      opts,
      pipelineContext,
      shouldPreserveAppCssExtension: false,
    })).toBe('app-origin.wxss')
    expect(resolveOutputFileFromMatchedCssSource({
      bundleFiles: ['pages/index.wxss'],
      defaultStyleOutputExtension: '.wxss',
      isWebGeneratorTarget: false,
      opts,
      rootDir: '/repo',
      shouldPreserveAppCssExtension: false,
      sourceFile: undefined,
    })).toBeUndefined()
    expect(resolveOutputFileFromMatchedCssSource({
      bundleFiles: ['pages/index.wxss'],
      defaultStyleOutputExtension: '.wxss',
      isWebGeneratorTarget: false,
      opts,
      rootDir: '/repo',
      shouldPreserveAppCssExtension: false,
      sourceFile: '/repo/src/pages/index.scss',
      sourceRoot: '/repo/src',
    })).toBe('pages/index.wxss')
    expect(resolveOutputFileFromMatchedCssSource({
      bundleFiles: ['pages/index.css'],
      defaultStyleOutputExtension: '.css',
      isWebGeneratorTarget: true,
      opts,
      rootDir: '/repo',
      shouldPreserveAppCssExtension: false,
      sourceFile: '/repo/src/pages/index.scss',
      sourceRoot: '/repo/src',
    })).toBeUndefined()
    expect(shouldSkipRawSourceStyleAsset('app.wxss', 'app.wxss', '.a{}')).toBe(false)
    expect(shouldSkipRawSourceStyleAsset('app.wxss', 'app.scss', '')).toBe(false)
    expect(shouldSkipRawSourceStyleAsset('app.wxss', 'app.scss', 'div { color: red; }')).toBe(false)
    expect(shouldSkipRawSourceStyleAsset('app.wxss', 'app.scss', '$color: red; .a { color: $color; }')).toBe(true)
    expect(shouldSkipRawSourceStyleAsset(
      'pages/index.scss',
      'pages/index.scss',
      '// https://sass-lang.com/documentation\n.a { color: turquoise; }',
      '/repo/pages/index.scss',
    )).toBe(true)
    expect(shouldSkipRawSourceStyleAsset('pages/index.wxss', 'pages/index.wxss', '<template><view>// marker</view></template>', '/repo/src/pages/index.vue')).toBe(true)
    expect(shouldSkipRawSourceStyleAsset('pages/index.wxss', 'pages/index.wxss', '$color: red; .a { color: $color; }', '/repo/src/pages/index.wxss', file => file.endsWith('.wxss'))).toBe(false)
    const sfcSourceVariants = {
      vue: [
        '/repo/src/pages/index.vue',
        '/repo/src/pages/index.vue?vue&type=template&id=abc&lang.ts',
        '/repo/src/pages/index.vue?vue&lang.ts&type=template&id=abc',
        '/repo/src/pages/index.vue?vue&type=template&id=abc&lang=ts',
        '/repo/src/pages/index.vue?vue&type=template&id=abc&ts=true',
        '/repo/src/pages/index.vue?vue&type=script&setup=true&lang.ts',
      ],
      nvue: [
        '/repo/src/pages/index.nvue',
        '/repo/src/pages/index.nvue?vue&type=template&id=abc&lang.ts',
        '/repo/src/pages/index.nvue?vue&lang.ts&type=template&id=abc',
        '/repo/src/pages/index.nvue?vue&type=template&id=abc&lang=ts',
        '/repo/src/pages/index.nvue?vue&type=template&id=abc&ts=true',
        '/repo/src/pages/index.nvue?vue&type=script&setup=true&lang.ts',
      ],
      uvue: [
        '/repo/src/pages/index.uvue',
        '/repo/src/pages/index.uvue?vue&type=template&id=abc&lang.uts',
        '/repo/src/pages/index.uvue?vue&lang.uts&type=template&id=abc',
        '/repo/src/pages/index.uvue?vue&type=template&id=abc&lang=uts',
        '/repo/src/pages/index.uvue?vue&type=template&id=abc&ts=true',
        '/repo/src/pages/index.uvue?vue&type=script&setup=true&lang.uts',
      ],
    } as const
    const miniProgramStyleOutputs = ['wxss', 'acss', 'ttss', 'qss'] as const
    for (const sourceFiles of Object.values(sfcSourceVariants)) {
      for (const sourceFile of sourceFiles) {
        for (const extension of miniProgramStyleOutputs) {
          const outputFile = `pages/index.${extension}`
          expect(shouldSkipRawSourceStyleAsset(outputFile, outputFile, '<template><view>// marker</view></template>', sourceFile), sourceFile).toBe(true)
        }
      }
    }
    const styleSourceAssets = [
      ['/repo/src/pages/index.vue?vue&type=style&index=0&lang.scss', 'pages/index.wxss'],
      ['/repo/src/pages/index.vue?vue&type=style&index=0&lang=scss&scoped=true', 'pages/index.wxss'],
      ['/repo/src/pages/index.vue?vue&type=style&index=0&lang.css#hash', 'pages/index.wxss'],
      ['/repo/src/pages/index.vue?vue&type=styles&index=0&lang=css', 'pages/index.wxss'],
      ['/repo/src/pages/index.nvue?vue&type=style&index=0&lang.css', 'pages/index.wxss'],
      ['/repo/src/pages/index.nvue?vue&type=style&index=0&lang=css#hash', 'pages/index.wxss'],
      ['/repo/src/pages/index.uvue?vue&type=style&index=0&lang.scss', 'pages/index.wxss'],
      ['/repo/src/pages/index.uvue?vue&type=style&index=0&inline&lang.css', 'pages/index.wxss'],
      ['/repo/src/pages/index.wxss', 'pages/index.wxss'],
      ['/repo/src/pages/index.acss', 'pages/index.acss'],
    ] as const
    for (const [sourceFile, outputFile] of styleSourceAssets) {
      expect(shouldSkipRawSourceStyleAsset(outputFile, outputFile, '$color: red; .a { color: $color; }', sourceFile, file => /\.(?:wxss|acss|ttss|qss)$/.test(file)), sourceFile).toBe(false)
    }

    const fallback = vi.fn((sourceFile?: string) => sourceFile ? `out/${sourceFile}` : undefined)
    const resolve = createMatchedCssSourceOutputResolver({
      assetSourceFile: '/repo/src/app.css',
      file: 'app.wxss',
      originalFileNames: ['/repo/src/aliased.css'],
      resolveOutputFileFromMatchedCssSource: fallback,
    })
    expect(resolve(undefined)).toBeUndefined()
    expect(resolve('/repo/src/app.css?direct')).toBe('app.wxss')
    expect(resolve('/repo/src/aliased.css')).toBe('app.wxss')
    expect(resolve('pages/index.css')).toBe('out/pages/index.css')
    const resolveMisplacedSameBasenameCss = createMatchedCssSourceOutputResolver({
      assetSourceFile: '/repo/src/pages/index/index.css',
      file: 'sub-independent/pages/index.ttss',
      resolveOutputFileFromMatchedCssSource: sourceFile =>
        sourceFile === '/repo/src/pages/index/index.css'
          ? 'pages/index/index.ttss'
          : undefined,
    })
    expect(resolveMisplacedSameBasenameCss('/repo/src/pages/index/index.css')).toBe('pages/index/index.ttss')
    expect(hasViteProcessedCssResultForSource('app.wxss', () => new Map([['app.wxss', {}]]))).toBe(true)
    expect(hasViteProcessedCssResultForSource('app.wxss', () => new Map([['pages/app.wxss', {}]]))).toBe(false)
    expect(hasViteProcessedCssResultForSource('app.wxss')).toBe(false)

    const same = createAsset('old')
    applyCssResultToBundle({
      appType: 'native',
      assetSourceFile: '/repo/src/app.css',
      bundle: { 'app.wxss': same },
      emitOrReplayCssAsset: vi.fn(),
      file: 'app.wxss',
      originalSource: same,
      outputFile: 'app.wxss',
      source: 'new',
      viteProcessedCssAsset: false,
    })
    expect(same.source).toBe('new')

    const original = createAsset('old', ['/repo/src/app.css'])
    const existing = createAsset('existing')
    applyCssResultToBundle({
      assetSourceFile: '/repo/src/app.css',
      bundle: { 'app.wxss': original, 'app-origin.wxss': existing },
      cssPipelineStrategy: taroRootStyleStrategy,
      emitOrReplayCssAsset: vi.fn(),
      file: 'app.wxss',
      originalSource: original,
      outputFile: 'app-origin.wxss',
      pipelineContext,
      source: 'generated',
      viteProcessedCssAsset: false,
    })
    expect(existing.source).toBe('generated')
    expect(original.source).toBe('@import "./app-origin.wxss";\n')

    const emittedOrigin = createAsset('old', ['/repo/src/app.css'])
    const emitOrigin = vi.fn()
    applyCssResultToBundle({
      assetSourceFile: '/repo/src/app.css',
      bundle: { 'app.wxss': emittedOrigin },
      cssPipelineStrategy: taroRootStyleStrategy,
      emitOrReplayCssAsset: emitOrigin,
      file: 'app.wxss',
      originalSource: emittedOrigin,
      outputFile: 'app-origin.wxss',
      pipelineContext,
      source: 'generated',
      viteProcessedCssAsset: false,
    })
    expect(emitOrigin).toHaveBeenCalledWith('app-origin.wxss', 'generated')
    expect(emittedOrigin.source).toBe('@import "./app-origin.wxss";\n')

    const originalNoShell = createAsset('old', ['/repo/src/app.css'])
    const existingNoShell = createAsset('existing')
    applyCssResultToBundle({
      appType: 'native',
      assetSourceFile: '/repo/src/app.css',
      bundle: { 'app.wxss': originalNoShell, 'app-origin.wxss': existingNoShell },
      emitOrReplayCssAsset: vi.fn(),
      file: 'app.wxss',
      originalSource: originalNoShell,
      outputFile: 'app-origin.wxss',
      source: 'generated',
      viteProcessedCssAsset: false,
    })
    expect(existingNoShell.source).toBe('generated')
    expect(originalNoShell.source).toBe('')

    const secondOriginal = createAsset('old')
    const secondExisting = createAsset('existing')
    applyCssResultToBundle({
      appType: 'native',
      assetSourceFile: '/repo/src/pages/index.css',
      bundle: { 'pages/index.wxss': secondOriginal, 'pages/index.css': secondExisting },
      emitOrReplayCssAsset: vi.fn(),
      file: 'pages/index.wxss',
      originalSource: secondOriginal,
      outputFile: 'pages/index.css',
      source: 'generated',
      viteProcessedCssAsset: true,
    })
    expect(secondExisting.source).toBe('generated')
    expect(secondOriginal.source).toBe('')

    const emitted = createAsset('old')
    const emitOrReplayCssAsset = vi.fn()
    const bundle = { 'pages/index.scss': emitted }
    applyCssResultToBundle({
      appType: 'native',
      assetSourceFile: '/repo/src/pages/index.css',
      bundle,
      emitOrReplayCssAsset,
      file: 'pages/index.scss',
      originalSource: emitted,
      outputFile: 'pages/index.css',
      source: 'generated',
      viteProcessedCssAsset: false,
    })
    expect(emitOrReplayCssAsset).toHaveBeenCalledWith('pages/index.css', 'generated')
    expect(bundle['pages/index.scss']).toBeUndefined()

    const kept = createAsset('old')
    applyCssResultToBundle({
      appType: 'native',
      assetSourceFile: '/repo/src/pages/index.css',
      bundle: { 'pages/index.wxss': kept },
      emitOrReplayCssAsset: vi.fn(),
      file: 'pages/index.wxss',
      originalSource: kept,
      outputFile: 'pages/index.css',
      source: 'generated',
      viteProcessedCssAsset: true,
    })
    expect(kept.source).toBe('')
  })

  it('replays css assets into current bundle instead of emitting duplicate names', () => {
    const emitFile = vi.fn()
    const existing = createAsset('old')
    const bundle: Record<string, ReturnType<typeof createAsset>> = {
      'main.wxss': existing,
    }
    const emitOrReplayCssAsset = createCssAssetEmitter({ emitFile }, bundle)

    expect(emitOrReplayCssAsset('main.wxss', 'updated')).toBe(existing)
    expect(existing.source).toBe('updated')
    expect(emitFile).not.toHaveBeenCalled()

    const aliased = createAsset('stale')
    aliased.fileName = 'aliased.wxss'
    bundle['internal.css'] = aliased
    expect(emitOrReplayCssAsset('aliased.wxss', 'refreshed')).toBe(aliased)
    expect(aliased.source).toBe('refreshed')
    expect(emitFile).not.toHaveBeenCalled()

    const replayed = emitOrReplayCssAsset('app.wxss', 'generated')
    expect(replayed).toBeUndefined()
    expect(bundle['app.wxss']).toBeUndefined()
    expect(emitFile).toHaveBeenCalledWith({
      type: 'asset',
      fileName: 'app.wxss',
      source: 'generated',
    })
  })
})
