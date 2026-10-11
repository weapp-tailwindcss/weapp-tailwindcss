import type { SetupWebpackV5ProcessAssetsHookOptions } from './helpers'
import type { WebpackCssHandlerOptions } from './pipeline-helpers'
import path from 'node:path'
import { normalizeStyleHandlerMajorVersion } from '@/context/style-options'
import { resolveTailwindcssOptions } from '@/tailwindcss/runtime-options'
import { hasTailwindApplyDirective, hasTailwindRootDirectives } from '../../../../generation/directives'
import { hasTailwindGeneratedCss, hasTailwindGeneratedCssMarkers, hasTailwindSourceDirectives } from '../../../../generation/index'
import { scoreTailwindV4CssSourceFileMatch } from '../../../../generation/source-resolver/matching'
import { inferWebpackMainCssFiles, resolveSingleActiveWebpackCssResource } from '../shared'
import { createWebpackGeneratorCssSource, isSameWebpackCssSourceScope, isWebpackCssSourceRepresentedInAsset, removeWebpackGeneratorNonTailwindImports } from './pipeline-helpers'

function normalizeWebpackCssSourceRef(file: string) {
  return file.replaceAll('\\', '/')
}

function collectWebpackCssTokenSourceRefs(source: string) {
  const refs = new Set<string>()
  for (const line of source.split('\n')) {
    if (!line.includes('/* tokens:') || !line.includes('<=')) {
      continue
    }
    const traceStart = line.indexOf('<=')
    const traceEnd = line.indexOf('*/', traceStart)
    const trace = line.slice(traceStart + 2, traceEnd >= 0 ? traceEnd : undefined)
    for (const segment of trace.split('|')) {
      const sourceList = segment
        .replace(/^[^<]*<=\s*/, '')
        .split(',')
      for (const ref of sourceList) {
        const normalizedRef = ref.trim()
        if (normalizedRef) {
          refs.add(normalizeWebpackCssSourceRef(normalizedRef))
        }
      }
    }
  }
  return refs
}

function readWebpackCompilationAssetSource(
  compilation: {
    getAsset?: ((file: string) => { source?: { source?: (() => string | { toString: () => string }) } } | undefined) | undefined
  },
  file: string,
) {
  const source = compilation.getAsset?.(file)?.source?.source?.()
  if (source === undefined) {
    return undefined
  }
  return typeof source === 'string' ? source : source.toString()
}

function resolveWebpackCssImportFile(file: string, request: string) {
  if (/^(?:https?:)?\/\//i.test(request) || request.startsWith('/')) {
    return undefined
  }
  if (!/\.(?:css|wxss|acss|ttss|qss|jxss|tyss)(?:$|[?#])/i.test(request)) {
    return undefined
  }
  const cleanRequest = request.replace(/[?#].*$/, '')
  return normalizeWebpackCssSourceRef(path.posix.join(path.posix.dirname(normalizeWebpackCssSourceRef(file)), cleanRequest))
}

function collectCssImportRequests(source: string) {
  return [...source.matchAll(/@import\s+(?:url\(\s*)?(?:"([^"]+)"|'([^']+)'|([^\s;)]+))/g)]
    .map(match => match[1] ?? match[2] ?? match[3])
    .filter((request): request is string => typeof request === 'string' && request.length > 0)
}

function collectMainImportedCssFiles(
  compilation: {
    chunks: Iterable<{ files?: Iterable<string> | string[] | undefined }>
    getAsset?: ((file: string) => { source?: { source?: (() => string | { toString: () => string }) } } | undefined) | undefined
  },
  cssAssetFiles: Iterable<string>,
  cssMatcher: (file: string) => boolean,
  isMainCssFile: (file: string) => boolean,
) {
  const files = new Set<string>()
  const candidates = new Set<string>(cssAssetFiles)
  for (const chunk of compilation.chunks) {
    for (const file of chunk.files ?? []) {
      candidates.add(file)
    }
  }
  for (const file of candidates) {
    if (!cssMatcher(file) || !isMainCssFile(file)) {
      continue
    }
    const source = readWebpackCompilationAssetSource(compilation, file)
    if (!source?.includes('@import')) {
      continue
    }
    for (const request of collectCssImportRequests(source)) {
      const importedFile = resolveWebpackCssImportFile(file, request)
      if (importedFile) {
        files.add(importedFile)
      }
    }
  }
  return files
}

export function createWebpackCssSourceResolvers(options: {
  activeWebpackAssetResourceFiles: ReadonlySet<string>
  appType: SetupWebpackV5ProcessAssetsHookOptions['appType']
  compilerOptions: SetupWebpackV5ProcessAssetsHookOptions['options']
  compilation: {
    chunks: Iterable<{ files?: Iterable<string> | string[] | undefined, hasRuntime?: () => boolean, name?: string | undefined }>
    getAsset?: ((file: string) => { source?: { source?: (() => string | { toString: () => string }) } } | undefined) | undefined
  }
  cssAssetFiles: Iterable<string>
  cssAssetResources: ReadonlyMap<string, ReadonlySet<string>>
  directCssAssetResources: ReadonlyMap<string, ReadonlySet<string>>
  cssHandlerOptionsCache: Map<string, WebpackCssHandlerOptions>
  cssSources: Map<string, { css: string | undefined, processed?: boolean | undefined }>
  cssUserHandlerOptionsCache: Map<string, WebpackCssHandlerOptions>
  groupedCssEntriesLength: number
  singleCssAssetFile?: string | undefined
  isWebGeneratorTarget: boolean
  outputDir: string
  runtimeState: SetupWebpackV5ProcessAssetsHookOptions['runtimeState']
}) {
  const {
    activeWebpackAssetResourceFiles,
    appType,
    compilerOptions,
    compilation,
    cssAssetFiles,
    cssAssetResources,
    directCssAssetResources,
    cssHandlerOptionsCache,
    cssSources,
    cssUserHandlerOptionsCache,
    groupedCssEntriesLength,
    singleCssAssetFile,
    isWebGeneratorTarget,
    outputDir,
    runtimeState,
  } = options
  const hasConfiguredTailwindV4SourceRoots = () => {
    const tailwindOptions = resolveTailwindcssOptions(runtimeState.tailwindRuntime.options)
    return (tailwindOptions?.v4?.cssEntries?.length ?? 0) > 0
      || (tailwindOptions?.v4?.cssSources?.length ?? 0) > 0
  }
  const configuredCssEntryFiles = (() => {
    const tailwindOptions = resolveTailwindcssOptions(runtimeState.tailwindRuntime.options)
    const entries = [
      ...(compilerOptions.cssEntries ?? []),
      ...(tailwindOptions?.v4?.cssEntries ?? []),
    ]
      .filter((file): file is string => typeof file === 'string' && file.length > 0)
      .map(file => path.resolve(file))
    return [...new Set(entries)]
  })()
  const configuredMainCssEntryFiles = configuredCssEntryFiles.slice(0, 1)
  const scoreCssSourceOutputMatch = (file: string, sourceFile: string) => scoreTailwindV4CssSourceFileMatch(file, sourceFile, {
    outputRoot: outputDir,
    projectRoot: compilerOptions.tailwindcssBasedir,
    cwd: compilerOptions.tailwindcssBasedir,
  })
  const isConfiguredMainCssEntryFile = (sourceFile: string) =>
    configuredMainCssEntryFiles.some(entry => path.resolve(entry) === path.resolve(sourceFile))
  const isCssSourceAllowedForOutput = (file: string, sourceFile: string) =>
    !isConfiguredMainCssEntryFile(sourceFile)
    || directCssAssetResources.get(file)?.has(sourceFile) === true
    || scoreCssSourceOutputMatch(file, sourceFile) > 0
  const inferredMainCssFiles = new Set([...inferWebpackMainCssFiles(
    compilation.chunks as Iterable<{ files?: Iterable<string> | string[] | undefined, hasRuntime?: () => boolean, name?: string | undefined }>,
    compilerOptions.cssMatcher,
    {
      mainSourceFiles: new Set(configuredMainCssEntryFiles),
      resourcesByAsset: cssAssetResources,
    },
  )].filter((file) => {
    if (configuredMainCssEntryFiles.length === 0) {
      return true
    }
    const resources = cssAssetResources.get(file)
    return [...(resources ?? [])].some(resource =>
      isConfiguredMainCssEntryFile(resource) && isCssSourceAllowedForOutput(file, resource),
    )
  }))
  const mainImportedCssFiles = collectMainImportedCssFiles(compilation, cssAssetFiles, compilerOptions.cssMatcher, file =>
    compilerOptions.mainCssChunkMatcher(file, appType) || inferredMainCssFiles.has(file))
  const singleConfiguredCssAsset = isWebGeneratorTarget
    && configuredMainCssEntryFiles.length > 0
    && groupedCssEntriesLength === 1
    ? singleCssAssetFile
    : undefined
  const isMainCssChunk = (file: string) => {
    const resources = cssAssetResources.get(file)
    if (resources && configuredCssEntryFiles.length > 0) {
      for (const resource of resources) {
        const index = configuredCssEntryFiles.findIndex(entry => path.resolve(entry) === path.resolve(resource))
        if (index >= 0) {
          return index === 0
        }
      }
    }
    if (configuredCssEntryFiles.length > 1) {
      return false
    }
    return compilerOptions.mainCssChunkMatcher(file, appType)
      || inferredMainCssFiles.has(file)
      || mainImportedCssFiles.has(normalizeWebpackCssSourceRef(file))
      || file === singleConfiguredCssAsset
  }
  const activeWebpackCssSourceFiles = new Set<string>()
  const resolveConfiguredMainCssSourceFile = (file: string) => {
    if (!isMainCssChunk(file)) {
      return undefined
    }
    if (configuredMainCssEntryFiles.length !== 1) {
      return undefined
    }
    if (groupedCssEntriesLength !== 1 && file !== singleCssAssetFile) {
      return undefined
    }
    for (const sourceFile of configuredMainCssEntryFiles) {
      if (cssSources.has(sourceFile)) {
        activeWebpackCssSourceFiles.add(sourceFile)
        return sourceFile
      }
    }
    return undefined
  }
  const resolveWebpackCssSourceFile = (file: string, rawSource?: string | undefined) => {
    const assetResources = cssAssetResources.get(file)
    const activeAssetResource = resolveSingleActiveWebpackCssResource(assetResources, activeWebpackAssetResourceFiles)
    if (cssSources.size === 0) {
      if (activeAssetResource && isCssSourceAllowedForOutput(file, activeAssetResource)) {
        activeWebpackCssSourceFiles.add(activeAssetResource)
        return activeAssetResource
      }
      if (assetResources && assetResources.size > 0) {
        return undefined
      }
      return resolveConfiguredMainCssSourceFile(file)
    }
    const resourceMatches = [...(assetResources ?? [])]
      .filter(sourceFile => cssSources.has(sourceFile))
      .filter(sourceFile => isCssSourceAllowedForOutput(file, sourceFile))
      .sort()
    const configuredResourceMatches = resourceMatches.filter(sourceFile =>
      configuredCssEntryFiles.some(entry => path.resolve(entry) === path.resolve(sourceFile)),
    )
    if (configuredResourceMatches.length === 1) {
      const sourceFile = configuredResourceMatches[0]!
      activeWebpackCssSourceFiles.add(sourceFile)
      return sourceFile
    }
    if (resourceMatches.length === 1) {
      const sourceFile = resourceMatches[0]
      activeWebpackCssSourceFiles.add(sourceFile!)
      return sourceFile
    }
    const tailwindSourceMatches = resourceMatches.filter((sourceFile) => {
      const sourceCss = cssSources.get(sourceFile)?.css
      return sourceCss
        && (
          hasTailwindRootDirectives(sourceCss, { importFallback: true })
          || hasTailwindSourceDirectives(sourceCss, { importFallback: true })
          || hasTailwindApplyDirective(sourceCss)
          || hasTailwindGeneratedCss(sourceCss)
          || hasTailwindGeneratedCssMarkers(sourceCss)
        )
    })
    if (tailwindSourceMatches.length === 1) {
      const sourceFile = tailwindSourceMatches[0]
      activeWebpackCssSourceFiles.add(sourceFile!)
      return sourceFile
    }
    if (activeAssetResource && isCssSourceAllowedForOutput(file, activeAssetResource)) {
      activeWebpackCssSourceFiles.add(activeAssetResource)
      return activeAssetResource
    }
    if (rawSource) {
      const tokenSourceRefs = collectWebpackCssTokenSourceRefs(rawSource)
      if (tokenSourceRefs.size > 0) {
        const tokenSourceMatches = [...cssSources.keys()]
          .filter((sourceFile) => {
            const relativeSourceFile = normalizeWebpackCssSourceRef(path.relative(compilerOptions.tailwindcssBasedir, sourceFile))
            const absoluteSourceFile = normalizeWebpackCssSourceRef(path.resolve(sourceFile))
            return tokenSourceRefs.has(relativeSourceFile) || tokenSourceRefs.has(absoluteSourceFile)
          })
          .sort()
        if (tokenSourceMatches.length === 1) {
          const sourceFile = tokenSourceMatches[0]!
          activeWebpackCssSourceFiles.add(sourceFile)
          return sourceFile
        }
      }
      const representedTailwindSourceMatches = [...cssSources.entries()]
        .filter(([, source]) => isWebpackCssSourceRepresentedInAsset(rawSource, source.css))
        .map(([sourceFile]) => ({
          sourceFile,
          score: scoreTailwindV4CssSourceFileMatch(file, sourceFile, {
            outputRoot: outputDir,
            projectRoot: compilerOptions.tailwindcssBasedir,
            cwd: compilerOptions.tailwindcssBasedir,
          }),
        }))
        .filter(match => match.score > 0)
        .sort((a, b) => b.score - a.score || a.sourceFile.localeCompare(b.sourceFile))
      const bestScore = representedTailwindSourceMatches[0]?.score ?? 0
      const bestMatches = representedTailwindSourceMatches.filter(match => match.score === bestScore)
      if (bestMatches.length === 1) {
        const sourceFile = bestMatches[0]!.sourceFile
        activeWebpackCssSourceFiles.add(sourceFile)
        return sourceFile
      }
    }
    const pathMatches = [...cssSources.keys()]
      .map(sourceFile => ({
        sourceFile,
        score: scoreTailwindV4CssSourceFileMatch(file, sourceFile, {
          outputRoot: outputDir,
          projectRoot: compilerOptions.tailwindcssBasedir,
          cwd: compilerOptions.tailwindcssBasedir,
        }),
      }))
      .filter(match => match.score >= 1000)
      .sort((a, b) => b.score - a.score || a.sourceFile.localeCompare(b.sourceFile))
    const bestPathScore = pathMatches[0]?.score ?? 0
    const bestPathMatches = pathMatches.filter(match => match.score === bestPathScore)
    if (bestPathMatches.length === 1) {
      const sourceFile = bestPathMatches[0]!.sourceFile
      activeWebpackCssSourceFiles.add(sourceFile)
      return sourceFile
    }
    if (assetResources && assetResources.size > 0) {
      return undefined
    }
    return resolveConfiguredMainCssSourceFile(file)
  }
  const isSameWebpackSourceScope = (outputFile: string, candidateSourceFile: string, currentSourceFile?: string | undefined) =>
    isSameWebpackCssSourceScope({
      candidateSourceFile,
      currentSourceFile,
      outputFile,
      resourcesByAsset: cssAssetResources,
    })
  const getCssHandlerOptions = (file: string, rawSource?: string | undefined) => {
    const majorVersion = runtimeState.tailwindRuntime.majorVersion
    const isMainCssAsset = isMainCssChunk(file)
    const sourceFile = resolveWebpackCssSourceFile(file, rawSource)
    const sourceMatchedMainCssEntry = sourceFile !== undefined
      && isConfiguredMainCssEntryFile(sourceFile)
      && isCssSourceAllowedForOutput(file, sourceFile)
    const isMainChunk = isMainCssAsset || sourceMatchedMainCssEntry
    const sourceCss = sourceFile ? cssSources.get(sourceFile)?.css : undefined
    const generatorSourceCss = removeWebpackGeneratorNonTailwindImports(sourceCss)
    const generatorCssSource = createWebpackGeneratorCssSource(sourceFile, generatorSourceCss)
    const cacheKey = [
      majorVersion ?? 'unknown',
      isMainChunk ? '1' : '0',
      sourceFile ?? 'asset',
      sourceCss === undefined ? 'source:0' : compilerOptions.cache.computeHash(sourceCss),
      generatorSourceCss === sourceCss || generatorSourceCss === undefined ? 'generator-source:0' : compilerOptions.cache.computeHash(generatorSourceCss),
      file,
    ].join(':')
    const cached = cssHandlerOptionsCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const created = {
      isMainChunk,
      postcssOptions: {
        options: {
          from: sourceFile ?? file,
        },
      },
      sourceOptions: {
        outputRoot: outputDir,
        ...(generatorCssSource === undefined ? {} : { cssSources: [generatorCssSource] }),
        ...(generatorSourceCss === undefined ? {} : { sourceCss: generatorSourceCss }),
        ...(sourceFile === undefined ? {} : { sourceFile }),
      },
      ...(normalizeStyleHandlerMajorVersion(majorVersion) === undefined ? {} : { majorVersion: 4 as const }),
    }
    cssHandlerOptionsCache.set(cacheKey, created)
    return created
  }
  const getCssUserHandlerOptions = (file: string) => {
    const majorVersion = runtimeState.tailwindRuntime.majorVersion
    const sourceFile = resolveWebpackCssSourceFile(file)
    const sourceCss = sourceFile ? cssSources.get(sourceFile)?.css : undefined
    const generatorSourceCss = removeWebpackGeneratorNonTailwindImports(sourceCss)
    const cacheKey = [
      majorVersion ?? 'unknown',
      sourceFile ?? 'asset',
      sourceCss === undefined ? 'source:0' : compilerOptions.cache.computeHash(sourceCss),
      generatorSourceCss === sourceCss || generatorSourceCss === undefined ? 'generator-source:0' : compilerOptions.cache.computeHash(generatorSourceCss),
      file,
    ].join(':')
    const cached = cssUserHandlerOptionsCache.get(cacheKey)
    if (cached) {
      return cached
    }

    const created = {
      ...getCssHandlerOptions(file),
      isMainChunk: false,
    }
    cssUserHandlerOptionsCache.set(cacheKey, created)
    return created
  }

  return {
    activeWebpackCssSourceFiles,
    configuredCssEntryFiles,
    configuredMainCssEntryFiles,
    getCssHandlerOptions,
    getCssUserHandlerOptions,
    hasConfiguredTailwindV4SourceRoots,
    isSameWebpackSourceScope,
    resolveWebpackCssSourceFile,
  }
}
