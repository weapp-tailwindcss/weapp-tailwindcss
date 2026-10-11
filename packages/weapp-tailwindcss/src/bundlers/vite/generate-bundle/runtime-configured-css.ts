import type { OutputBundle } from 'rollup'
import type { ViteFrameworkCssPipelineContext } from '../shared/framework-strategy'
import type { ConfiguredCssSourceEntry } from './configured-css-sources'
import type { GenerateBundleContext } from './types'
import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import { resolveTailwindcssOptions } from '@/tailwindcss/runtime-options'
import { normalizeOutputPathKey } from '../../shared/module-graph'
import { resolveViteCssPipelineOutputFile } from '../css-output'
import { collectConfiguredTailwindV4CssSourceEntries } from './configured-css-sources'
import { normalizeRelativeCssConfigDirectives } from './css-config-directives'
import { resolveOutputFileFromMatchedCssSource } from './css-output-helpers'
import { shouldKeepRootMiniProgramStyleAsImportShell } from './root-style-output'
import { hasTailwindGenerationSource } from './sfc-style-source'
import { isSubpackageOutputFile } from './subpackages'

export interface CreateConfiguredCssSourceRegistryOptions {
  bundleFiles: string[]
  defaultStyleOutputExtension: string
  getCssSource: (file: string) => string | undefined
  isWebGeneratorTarget: boolean
  opts: InternalUserDefinedOptions
  outDir: string
  rootDir: string
  runtimeState: GenerateBundleContext['runtimeState']
  sourceRoot?: string | undefined
}

function normalizeSystemAliasPathKey(file: string) {
  return file.startsWith('/private/var/') ? file.slice('/private'.length) : file
}

export function createConfiguredCssSourceRegistry(
  options: CreateConfiguredCssSourceRegistryOptions,
) {
  const runtimeTailwindcssOptions = resolveTailwindcssOptions(
    options.opts.tailwindcssRuntimeOptions,
  )
  const tailwindRuntimeOptions = resolveTailwindcssOptions(
    options.runtimeState.tailwindRuntime.options,
  )
  const explicitCssEntryFiles = [...new Set([
    ...(Array.isArray(options.opts.cssEntries) ? options.opts.cssEntries : []),
    ...(Array.isArray(options.opts.tailwindcss?.v4?.cssEntries)
      ? options.opts.tailwindcss.v4.cssEntries
      : []),
    ...(Array.isArray(runtimeTailwindcssOptions?.v4?.cssEntries)
      ? runtimeTailwindcssOptions.v4.cssEntries
      : []),
    ...(Array.isArray(tailwindRuntimeOptions?.v4?.cssEntries)
      ? tailwindRuntimeOptions.v4.cssEntries
      : []),
  ].filter(file => typeof file === 'string' && file.length > 0))]
  const normalizeConfiguredCssSourceCacheKey = (file: string) => normalizeSystemAliasPathKey(
    normalizeOutputPathKey(path.resolve(file.replace(/[?#].*$/, ''))),
  )
  const getSourceEntries = () => {
    const collectedEntries = collectConfiguredTailwindV4CssSourceEntries({
      ...options.opts,
      tailwindcssRuntimeOptions: {
        ...(options.opts.tailwindcssRuntimeOptions ?? {}),
        tailwindcss: {
          ...(resolveTailwindcssOptions(options.opts.tailwindcssRuntimeOptions) ?? {}),
          ...(resolveTailwindcssOptions(options.runtimeState.tailwindRuntime.options) ?? {}),
        },
      },
    }, options.opts.tailwindcssBasedir ?? options.rootDir)
    const cachedEntries = explicitCssEntryFiles.flatMap((file) => {
      const resolvedFile = path.isAbsolute(file)
        ? path.resolve(file)
        : path.resolve(options.opts.tailwindcssBasedir ?? options.rootDir, file)
      const source = options.getCssSource(resolvedFile)
      return typeof source === 'string' && source.length > 0
        ? [{ file: resolvedFile, source }]
        : []
    })
    const cachedFileKeys = new Set(
      cachedEntries.map(entry => normalizeConfiguredCssSourceCacheKey(entry.file)),
    )
    return [
      ...cachedEntries,
      ...collectedEntries.filter(
        entry => !cachedFileKeys.has(normalizeConfiguredCssSourceCacheKey(entry.file)),
      ),
    ]
  }

  return {
    explicitCssEntryFiles,
    getSourceEntries,
    normalizeGeneratorUserRawSource: (
      source: string,
      sourceFile: string,
      fallbackFile?: string | undefined,
    ) => normalizeRelativeCssConfigDirectives(
      source,
      sourceFile || (fallbackFile ?? ''),
      options.outDir,
      options.opts,
    ),
    resolveMatchedSourceOutputFile: (sourceFile: string) => resolveOutputFileFromMatchedCssSource({
      bundleFiles: options.bundleFiles,
      defaultStyleOutputExtension: options.defaultStyleOutputExtension,
      isWebGeneratorTarget: options.isWebGeneratorTarget,
      opts: options.opts,
      rootDir: options.rootDir,
      shouldPreserveAppCssExtension: false,
      sourceFile,
      sourceRoot: options.sourceRoot,
    }),
  }
}

export interface CreateConfiguredCssRootResolversOptions {
  rootImportShellTargets?: ReadonlyMap<string, string> | undefined
  bundle: OutputBundle
  bundleFiles: string[]
  cssPipelineContext: ViteFrameworkCssPipelineContext
  cssPipelineStrategy: GenerateBundleContext['cssPipelineStrategy']
  currentSubpackageRoots?: Set<string> | undefined
  defaultStyleOutputExtension: string
  entries: ConfiguredCssSourceEntry[]
  explicitCssEntryFiles: string[]
  isWebGeneratorTarget: boolean
  opts: InternalUserDefinedOptions
  rootDir: string
  shouldPreserveAppCssExtension: boolean
  sourceRoot?: string | undefined
}

export function createConfiguredCssRootResolvers(
  options: CreateConfiguredCssRootResolversOptions,
) {
  const normalizeEntryFile = (file: string) => {
    const cleanFile = file.replace(/[?#].*$/, '')
    return normalizeSystemAliasPathKey(normalizeOutputPathKey(
      path.isAbsolute(cleanFile)
        ? path.resolve(cleanFile)
        : path.resolve(options.opts.tailwindcssBasedir ?? options.rootDir, cleanFile),
    ))
  }
  const sourceFileKeys = new Set(options.entries.map(entry => normalizeEntryFile(entry.file)))
  const explicitFileKeys = new Set(options.explicitCssEntryFiles.map(normalizeEntryFile))
  const isRootStyleOutputFile = (file: string) => {
    const normalized = normalizeOutputPathKey(file.replace(/[?#].*$/, ''))
    return normalized.endsWith('.css') && !normalized.includes('/')
  }
  const isMiniProgramStyleOutputFile = (file: string) => (
    /\.(?:wxss|acss|ttss|qss|jxss|tyss)(?:$|[?#])/i.test(file)
  )
  const resolveEntryOutputFile = (sourceFile: string) => resolveViteCssPipelineOutputFile(
    sourceFile,
    options.opts,
    options.rootDir,
    options.isWebGeneratorTarget,
    options.shouldPreserveAppCssExtension,
    options.sourceRoot,
    options.defaultStyleOutputExtension,
    options.bundleFiles,
  )
  const shouldSelectRootOutput = (outputFile: string) => {
    if (!options.opts.cssMatcher(outputFile) || !isRootStyleOutputFile(outputFile)) {
      return false
    }
    return options.cssPipelineStrategy?.shouldSelectConfiguredCssEntryRootSource?.({
      ...options.cssPipelineContext,
      isRootStyleOutputFile,
      outputFile,
    }) === true || options.cssPipelineContext.currentGeneratorBranch.isWeb
  }
  const selectSourceEntry = (
    outputFile: string,
    entries: ConfiguredCssSourceEntry[],
    originalFileNames?: string[] | undefined,
  ) => {
    const matchedOriginalEntry = entries.find(entry => originalFileNames?.some(
      originalFile => normalizeEntryFile(originalFile) === normalizeEntryFile(entry.file),
    ) === true)
    if (matchedOriginalEntry && outputFile.replace(/[?#].*$/, '').endsWith('.css')) {
      return matchedOriginalEntry
    }
    const shouldRequireExplicitEntry = !options.cssPipelineContext.currentGeneratorBranch.isWeb
      && options.opts.cssMatcher(outputFile)
      && isRootStyleOutputFile(outputFile)
    const generationEntries = entries.filter(entry => (
      hasTailwindGenerationSource(entry.source)
      && (!shouldRequireExplicitEntry || explicitFileKeys.has(normalizeEntryFile(entry.file)))
    ))
    const matchedOutputEntries = generationEntries.filter(entry => (
      normalizeOutputPathKey(resolveEntryOutputFile(entry.file).replace(/[?#].*$/, ''))
      === normalizeOutputPathKey(outputFile.replace(/[?#].*$/, ''))
      || ((originalFileNames?.length ?? 0) === 0
        && normalizeOutputPathKey(options.rootImportShellTargets?.get(resolveEntryOutputFile(entry.file)) ?? '')
        === normalizeOutputPathKey(outputFile.replace(/[?#].*$/, '')))
    ))
    if (matchedOutputEntries.length === 1) {
      return matchedOutputEntries[0]
    }
    if (!shouldSelectRootOutput(outputFile)) {
      return undefined
    }
    if (generationEntries.length <= 1) {
      return generationEntries[0]
    }
    const rootOutputEntries = generationEntries.filter(entry => !normalizeOutputPathKey(
      resolveEntryOutputFile(entry.file).replace(/[?#].*$/, ''),
    ).includes('/'))
    if (rootOutputEntries.length === 1) {
      return rootOutputEntries[0]
    }
    if (options.currentSubpackageRoots) {
      const mainPackageEntries = generationEntries.filter(entry => !isSubpackageOutputFile(
        resolveEntryOutputFile(entry.file),
        options.currentSubpackageRoots!,
      ))
      if (mainPackageEntries.length === 1) {
        return mainPackageEntries[0]
      }
    }
    return undefined
  }
  const shouldKeepRootImportShell = (outputFile: string, css?: string | undefined) => {
    const normalizedOutputFile = normalizeOutputPathKey(outputFile.replace(/[?#].*$/, ''))
    return options.opts.cssMatcher(outputFile)
      && isMiniProgramStyleOutputFile(outputFile)
      && !normalizedOutputFile.includes('/')
      && shouldKeepRootMiniProgramStyleAsImportShell(
        options.cssPipelineStrategy?.shouldKeepRootMiniProgramStyleAsImportShell?.({
          ...options.cssPipelineContext,
          css: css as string,
          file: outputFile,
        }),
      )
  }

  return {
    configuredTailwindV4ExplicitCssEntryFileKeysForScope: explicitFileKeys,
    configuredTailwindV4CssSourceFileKeysForScope: sourceFileKeys,
    hasExplicitConfiguredRootCssEntryForOutput: (outputFile: string) => {
      if (
        options.cssPipelineContext.currentGeneratorBranch.isWeb
        || !options.opts.cssMatcher(outputFile)
        || !isRootStyleOutputFile(outputFile)
        || !shouldSelectRootOutput(outputFile)
      ) {
        return false
      }
      return options.entries.some((entry) => {
        if (!explicitFileKeys.has(normalizeEntryFile(entry.file))) {
          return false
        }
        const entryOutputFile = resolveEntryOutputFile(entry.file)
        return !normalizeOutputPathKey(entryOutputFile.replace(/[?#].*$/, '')).includes('/')
          || (
            options.currentSubpackageRoots != null
            && !isSubpackageOutputFile(entryOutputFile, options.currentSubpackageRoots)
          )
      })
    },
    isMiniProgramStyleOutputFile,
    normalizeConfiguredTailwindV4CssEntryFileKey: normalizeEntryFile,
    resolveConfiguredCssEntryRootInjectionTarget: (
      sourceFile: string | undefined,
      outputFile: string,
    ) => {
      if (
        !outputFile.replace(/[?#].*$/, '').endsWith('.css')
        || typeof sourceFile !== 'string'
        || !explicitFileKeys.has(normalizeEntryFile(sourceFile))
      ) {
        return undefined
      }
      return options.cssPipelineStrategy?.resolveConfiguredCssEntryRootInjectionTarget?.({
        ...options.cssPipelineContext,
        bundle: options.bundle,
        isConfiguredCssEntryFile: file => typeof file === 'string'
          && explicitFileKeys.has(normalizeEntryFile(file)),
        isMiniProgramStyleOutputFile,
        isRootStyleOutputFile,
        outputFile,
        sourceFile,
      })
    },
    resolveConfiguredRootCssSourceStyle: (
      outputFile: string,
      entries: ConfiguredCssSourceEntry[],
      originalFileNames?: string[] | undefined,
    ) => {
      const entry = selectSourceEntry(outputFile, entries, originalFileNames)
      return entry
        ? { outputFile, rawSource: entry.source, sourceFile: entry.file }
        : undefined
    },
    selectConfiguredRootCssSourceEntry: selectSourceEntry,
    shouldKeepCurrentRootCssOutputForConfiguredSource: (
      sourceFile: string | undefined,
      outputFile: string,
    ) => {
      const normalizedOutputFile = normalizeOutputPathKey(outputFile.replace(/[?#].*$/, ''))
      const isRootConfiguredStyleOutput = normalizedOutputFile.endsWith('.css')
        ? isRootStyleOutputFile(outputFile)
        : isMiniProgramStyleOutputFile(outputFile) && !normalizedOutputFile.includes('/')
      return typeof sourceFile === 'string'
        && options.opts.cssMatcher(outputFile)
        && isRootConfiguredStyleOutput
        && !shouldKeepRootImportShell(outputFile)
        && explicitFileKeys.has(normalizeEntryFile(sourceFile))
    },
    shouldKeepCurrentRootMiniProgramStyleOutputAsImportShell: shouldKeepRootImportShell,
    shouldSelectConfiguredRootCssOutput: shouldSelectRootOutput,
  }
}
