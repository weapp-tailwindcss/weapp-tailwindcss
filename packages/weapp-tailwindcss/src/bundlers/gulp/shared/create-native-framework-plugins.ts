import type File from 'vinyl'
import type { RuntimeClassSetManager } from '../../shared/runtime-class-set'
import type { IStyleHandlerOptions, ITemplateHandlerOptions, JsModuleGraphOptions, UserDefinedOptions } from '@/types'
import path from 'node:path'
import process from 'node:process'
import { beginCompilerShadowRun as beginShadowRun, createCompilationDependencyChanges, createRuntimeCompilationBuildState, disposeCompilerOwner, finalizeCompilerShadowRun, getCompilationScopeDependencyRevision, getCompilerShadowRunSnapshot, invalidateCompilationScope, recordCompilationDependencyChanges, removeRuntimeCompilationBuildStateFiles, updateRuntimeCompilationBuildState } from '@/compiler'
import { COMPILATION_EVENT_SCHEMA_VERSION } from '@/compiler/events'
import { createCompilerRuntimeState } from '@/compiler/runtime-state'
import { getCompilerContext } from '@/context'
import { normalizeStyleHandlerMajorVersion } from '@/context/style-options'
import { createDebug } from '@/debug'
import { prependConfigDirective } from '@/generation/config-directive'
import { hasTailwindRootDirectives, normalizeTailwindConfigDirectives, normalizeTailwindSourceForGenerator } from '@/generation/directives'
import { resolveSourceScanEntries } from '@/project-sources'
import { createSourceCandidateCollector } from '@/project-sources/candidates'
import { createTailwindRuntimeReadyPromise, ensureRuntimeClassSet } from '@/tailwindcss/runtime'
import { getRuntimeClassSetSignature } from '@/tailwindcss/runtime/cache'
import { hasConfiguredTailwindV4CssRoots, removeTailwindV4CssSource, upsertTailwindV4CssSource } from '@/tailwindcss/v4/css-sources'
import { splitLocalCssImports } from '../../../generation/local-imports'
import { createRuntimeClassSetManager } from '../../shared/runtime-class-set'
import { createGulpModuleGraphOptions } from '../module-graph'
import { createGulpRuntimeSnapshot } from '../runtime-snapshot'
import {
  pruneGulpRuntimeSourceCaches,
  resolveGulpMemoryDebugStats,
  touchMapEntry,
} from './create-native-framework-plugins/cache-state'
import { createGulpFileTransforms } from './create-native-framework-plugins/file-transforms'

const debug = createDebug()
const GULP_COMPILATION_SCOPE_CACHE_MAX = 512

/**
 * @name weapp-tw-gulp
 * @description native framework 的插件组合实现
 * @link https://tw.weapp.dev/docs/quick-start/frameworks/native
 */
export function createNativeGulpPlugins(options: UserDefinedOptions = {}) {
  const hasInitialTailwindCssRoots = hasConfiguredTailwindV4CssRoots(options)
  const opts = getCompilerContext({
    ...options,
    __internalDeferMissingCssEntriesWarning: true,
  } as UserDefinedOptions)

  const { cache } = opts
  const initialTailwindRuntime = opts.tailwindRuntime
  const refreshTailwindcssRuntime = opts.refreshTailwindcssRuntime

  const readyPromise = createTailwindRuntimeReadyPromise(initialTailwindRuntime)

  let runtimeSet = new Set<string>()
  const runtimeState = createCompilerRuntimeState({
    tailwindRuntime: initialTailwindRuntime,
    readyPromise,
    refreshTailwindcssRuntime,
  })
  void runtimeState.events.emit({ schemaVersion: COMPILATION_EVENT_SCHEMA_VERSION, type: 'diagnostic', timestamp: new Date().toISOString(), adapter: 'gulp', phase: 'emit', revision: runtimeState.revision, operationId: `gulp-init-${Date.now()}`, evidence: ['createNativeGulpPlugins'] })
  const defaultStyleHandlerOptionsCache = new Map<number | 'unknown', Partial<IStyleHandlerOptions>>()
  let cachedDefaultTemplateHandlerOptions: Partial<ITemplateHandlerOptions> | undefined
  let cachedDefaultTemplateRuntimeSet: Set<string> | undefined
  let cachedDefaultModuleGraphOptions: JsModuleGraphOptions | undefined
  let cachedGulpSourceCandidateGetter: ((entries: Parameters<ReturnType<typeof createSourceCandidateCollector>['valuesForEntries']>[0]) => Set<string>) | undefined
  let cachedGulpSourceCandidateSourceGetter: ((entries: Parameters<ReturnType<typeof createSourceCandidateCollector>['sourcesForEntries']>[0]) => Map<string, Set<string>>) | undefined

  let runtimeSetInitialized = false
  let runtimeSetDirty = false
  const runtimeSourcesByFile = new Map<string, { source: string, type: 'html' | 'js' }>()
  const runtimeSnapshotState = createRuntimeCompilationBuildState()
  const generatedCssPreflightModeByFile = new Map<string, { inject: boolean, preserve: boolean }>()
  const compilationScopeBySourceFile = new Map<string, string>()
  let cachedGulpSourceCandidateSignature: string | undefined
  const gulpProcessCacheKeys = new Set<string>()
  const bundleRuntimeClassSetManager: RuntimeClassSetManager
    = (options as UserDefinedOptions & { __internalGulpRuntimeClassSetManager?: RuntimeClassSetManager }).__internalGulpRuntimeClassSetManager
      ?? createRuntimeClassSetManager()

  function invalidateGulpSourceCandidates() {
    cachedGulpSourceCandidateSignature = undefined
    cachedGulpSourceCandidateGetter = undefined
    cachedGulpSourceCandidateSourceGetter = undefined
  }

  async function refreshRuntimeSet(options: boolean | {
    forceRefresh?: boolean
    forceCollect?: boolean
    clearCache?: boolean
  } = false) {
    const normalizedOptions = typeof options === 'boolean'
      ? {
          forceRefresh: options,
          forceCollect: options,
          clearCache: options,
        }
      : options
    const forceRefresh = normalizedOptions.forceRefresh === true
    const shouldForceCollect = normalizedOptions.forceCollect === true || runtimeSetDirty
    const clearCache = normalizedOptions.clearCache === true || runtimeSetDirty
    if (!forceRefresh && !shouldForceCollect && runtimeSetInitialized) {
      return runtimeSet
    }
    runtimeSet = await ensureRuntimeClassSet(runtimeState, {
      forceRefresh,
      forceCollect: shouldForceCollect,
      clearCache,
      allowEmpty: false,
    })
    runtimeSetInitialized = true
    runtimeSetDirty = false
    return runtimeSet
  }

  async function refreshRuntimeSetForSource(file: File, rawSource: string, type: 'html' | 'js') {
    const filename = path.resolve(file.path)
    touchMapEntry(runtimeSourcesByFile, filename, {
      source: rawSource,
      type,
    })
    removeRuntimeCompilationBuildStateFiles(
      runtimeSnapshotState,
      pruneGulpRuntimeSourceCaches(runtimeSourcesByFile),
    )
    const snapshot = createGulpRuntimeSnapshot(
      runtimeSourcesByFile,
      runtimeSnapshotState,
      source => cache.computeHash(source),
    )
    const changed = snapshot.changedByType[type].has(filename)
    updateRuntimeCompilationBuildState(runtimeSnapshotState, snapshot, new Map())
    if (changed) {
      invalidateGulpSourceCandidates()
    }
    if (!changed && runtimeSetInitialized) {
      return runtimeSet
    }
    if (!runtimeSetDirty) {
      try {
        runtimeSet = await bundleRuntimeClassSetManager.sync(runtimeState.tailwindRuntime, snapshot)
        runtimeSetInitialized = true
        return runtimeSet
      }
      catch (error) {
        debug('gulp incremental runtime set sync failed, fallback to collect: %O', error)
        await bundleRuntimeClassSetManager.reset()
      }
    }
    return refreshRuntimeSet({
      forceCollect: true,
    })
  }

  async function refreshGulpV4SourceCandidates(forceRefresh = false) {
    const root = opts.tailwindcssBasedir ?? process.cwd()
    const sourceScan = await resolveSourceScanEntries(opts, runtimeState.tailwindRuntime, {
      root,
    })
    const nextSignature = cache.computeHash(JSON.stringify({
      root,
      entries: sourceScan?.entries,
      inlineCandidates: sourceScan?.inlineCandidates
        ? {
            included: [...sourceScan.inlineCandidates.included].sort(),
            excluded: [...sourceScan.inlineCandidates.excluded].sort(),
          }
        : undefined,
      explicit: sourceScan?.explicit ?? false,
      dependencies: [...(sourceScan?.dependencies ?? [])].sort(),
    }))
    if (!forceRefresh && cachedGulpSourceCandidateSignature === nextSignature && cachedGulpSourceCandidateGetter) {
      return cachedGulpSourceCandidateGetter
    }
    const collector = createSourceCandidateCollector({
      bareArbitraryValues: opts.arbitraryValues?.bareArbitraryValues,
      customAttributesEntities: opts.customAttributesEntities,
      disabledDefaultTemplateHandler: opts.disabledDefaultTemplateHandler,
    })
    await collector.scanRoot({
      entries: sourceScan?.entries,
      explicit: sourceScan?.explicit,
      root,
    })
    collector.syncInline(sourceScan?.inlineCandidates)
    cachedGulpSourceCandidateSignature = nextSignature
    cachedGulpSourceCandidateGetter = entries => collector.valuesForEntries(entries)
    cachedGulpSourceCandidateSourceGetter = entries => collector.sourcesForEntries(entries)
    return cachedGulpSourceCandidateGetter
  }

  function createRuntimeSetHash(rawSource: string, nextRuntimeSet: Set<string>, sourceTraceSignature?: string, sourceCandidateSignature?: string, outputSignature?: string) {
    return cache.computeHash([
      rawSource,
      getRuntimeClassSetSignature(runtimeState.tailwindRuntime),
      [...nextRuntimeSet].sort().join('\n'),
      sourceTraceSignature ?? 'css-source-trace:0',
      sourceCandidateSignature ?? 'gulp-source-candidates:0',
      outputSignature ?? 'gulp-output:0',
    ].join('\n\n'))
  }

  async function registerAutoCssSource(file: File, rawSource: string) {
    if (
      hasInitialTailwindCssRoots
      || (runtimeState.tailwindRuntime.majorVersion ?? 0) < 4
      || !file.path
      || !hasTailwindRootDirectives(rawSource)
    ) {
      return false
    }
    const sourceFile = path.resolve(file.path)
    const sourceCss = normalizeTailwindSourceForGenerator(
      normalizeTailwindConfigDirectives(rawSource, path.dirname(sourceFile)),
      { importFallback: true },
    )
    const config = runtimeState.tailwindRuntime.options?.tailwindcss?.config
    const generatorSourceCss = prependConfigDirective(splitLocalCssImports(sourceCss)?.source ?? sourceCss, config)
    const changed = upsertTailwindV4CssSource(opts, {
      file: sourceFile,
      base: path.dirname(sourceFile),
      css: generatorSourceCss,
    })
    if (!changed) {
      return false
    }
    runtimeSetInitialized = false
    runtimeSetDirty = true
    await bundleRuntimeClassSetManager.reset()
    debug('detected tailwindcss v4 css source from gulp css file: %s', file.path)
    return true
  }
  function resolveModuleGraphOptions(moduleGraph?: JsModuleGraphOptions) {
    if (moduleGraph) {
      return moduleGraph
    }

    if (!cachedDefaultModuleGraphOptions) {
      cachedDefaultModuleGraphOptions = createGulpModuleGraphOptions(opts)
    }

    return cachedDefaultModuleGraphOptions
  }

  function resolveWxssHandlerOptions(options?: Partial<IStyleHandlerOptions>) {
    const styleHandlerMajorVersion = normalizeStyleHandlerMajorVersion(runtimeState.tailwindRuntime.majorVersion)
    const majorVersion = styleHandlerMajorVersion ?? 'unknown'
    if (!options || Object.keys(options).length === 0) {
      let cached = defaultStyleHandlerOptionsCache.get(majorVersion)
      if (!cached) {
        cached = styleHandlerMajorVersion === undefined
          ? {}
          : {
              majorVersion: styleHandlerMajorVersion,
            }
        defaultStyleHandlerOptionsCache.set(majorVersion, cached)
      }
      return cached
    }

    return styleHandlerMajorVersion === undefined
      ? {
          ...options,
        }
      : {
          majorVersion: styleHandlerMajorVersion,
          ...options,
        }
  }

  function resolveGulpStyleOutputExtension(file: File) {
    return typeof opts.cssMatcher === 'function' && opts.cssMatcher(path.basename(file.path))
      ? path.extname(file.path)
      : undefined
  }

  function resolveGulpMatcherName(file: File) {
    const relative = file.relative || path.basename(file.path)
    return relative.replaceAll(path.sep, '/')
  }

  function resolveWxssFileHandlerOptions(file: File, rawSource: string, options?: Partial<IStyleHandlerOptions>) {
    const resolved = resolveWxssHandlerOptions(options)
    const sourceFile = file.path ? path.resolve(file.path) : undefined
    const sourceOptions = sourceFile
      ? {
          outputRoot: path.resolve(file.cwd ?? process.cwd()),
          sourceCss: rawSource,
          sourceFile,
        }
      : undefined
    if (resolved.isMainChunk !== undefined) {
      return {
        ...resolved,
        postcssOptions: {
          ...resolved.postcssOptions,
          options: {
            ...resolved.postcssOptions?.options,
            ...(sourceFile ? { from: sourceFile } : {}),
          },
        },
        ...(sourceOptions ? { sourceOptions } : {}),
      }
    }
    return {
      ...resolved,
      isMainChunk: opts.mainCssChunkMatcher(resolveGulpMatcherName(file), opts.appType),
      postcssOptions: {
        ...resolved.postcssOptions,
        options: {
          ...resolved.postcssOptions?.options,
          ...(sourceFile ? { from: sourceFile } : {}),
        },
      },
      ...(sourceOptions ? { sourceOptions } : {}),
    }
  }

  function resolveWxssUserHandlerOptions(options?: Partial<IStyleHandlerOptions>) {
    return {
      ...resolveWxssHandlerOptions(options),
      isMainChunk: false,
    }
  }

  function resolveWxmlHandlerOptions(options?: Partial<ITemplateHandlerOptions>) {
    if (!options || Object.keys(options).length === 0) {
      if (cachedDefaultTemplateRuntimeSet !== runtimeSet || !cachedDefaultTemplateHandlerOptions) {
        cachedDefaultTemplateRuntimeSet = runtimeSet
        cachedDefaultTemplateHandlerOptions = {
          runtimeSet,
        }
      }
      return cachedDefaultTemplateHandlerOptions
    }

    return {
      runtimeSet,
      ...options,
    }
  }

  function resolveGulpTransformTimingDetails(phase: string) {
    return {
      memoryDebug: resolveGulpMemoryDebugStats({
        cache,
        defaultStyleHandlerOptionsCache,
        gulpProcessCacheKeys,
        phase,
        runtimeSet,
        runtimeSourceHashByFile: runtimeSnapshotState.sourceHashByFile,
        runtimeSourcesByFile,
      }),
    }
  }

  function rememberCompilationScope(sourceFile: string, scopeId: string) {
    touchMapEntry(compilationScopeBySourceFile, path.resolve(sourceFile), scopeId)
    while (compilationScopeBySourceFile.size > GULP_COMPILATION_SCOPE_CACHE_MAX) {
      const oldestSourceFile = compilationScopeBySourceFile.keys().next().value
      if (typeof oldestSourceFile !== 'string') {
        break
      }
      compilationScopeBySourceFile.delete(oldestSourceFile)
    }
  }

  /** 记录 Gulp watcher 提交的源码或生成依赖变化。 */
  async function watchChange(
    id: string,
    change: { event: 'update' | 'delete' } = { event: 'update' },
  ) {
    beginShadowRun(runtimeState)
    const file = path.resolve(id)
    const affectedScopes = recordCompilationDependencyChanges(
      runtimeState,
      createCompilationDependencyChanges([file]),
    )
    invalidateGulpSourceCandidates()
    runtimeSetDirty = true
    if (change.event === 'delete') {
      const removedRuntimeSource = runtimeSourcesByFile.delete(file)
      const removedCssSource = removeTailwindV4CssSource(opts, file)
      const removedScopeId = compilationScopeBySourceFile.get(file)
      if (removedScopeId) {
        invalidateCompilationScope(runtimeState, removedScopeId)
        compilationScopeBySourceFile.delete(file)
      }
      removeRuntimeCompilationBuildStateFiles(runtimeSnapshotState, [file])
      generatedCssPreflightModeByFile.delete(file)
      gulpProcessCacheKeys.delete(file)
      cache.instance.delete(file)
      cache.hashMap.delete(file)
      if (removedRuntimeSource || removedCssSource) {
        runtimeSetInitialized = false
        runtimeSetDirty = true
        await bundleRuntimeClassSetManager.reset()
      }
    }
    return affectedScopes
  }

  const transforms = createGulpFileTransforms({
    cache,
    createRuntimeSetHash,
    debug,
    generatedCssPreflightModeByFile,
    getCompilationDependencyRevision: scopeId => getCompilationScopeDependencyRevision(runtimeState, scopeId),
    getSourceCandidateGetter: () => cachedGulpSourceCandidateGetter,
    getSourceCandidateSourceGetter: () => cachedGulpSourceCandidateSourceGetter,
    getRuntimeSet: () => runtimeSet,
    gulpProcessCacheKeys,
    opts,
    refreshGulpV4SourceCandidates,
    refreshRuntimeSet,
    refreshRuntimeSetForSource,
    registerAutoCssSource,
    rememberCompilationScope,
    resolveGulpStyleOutputExtension,
    resolveGulpTransformTimingDetails,
    resolveModuleGraphOptions,
    resolveWxmlHandlerOptions,
    resolveWxssFileHandlerOptions,
    resolveWxssUserHandlerOptions,
    runtimeState,
  })
  return {
    ...transforms,
    beginCompilerShadowRun: () => beginShadowRun(runtimeState),
    completeCompilerShadowRun: (revision?: number) => finalizeCompilerShadowRun(runtimeState, { revision }),
    async dispose() {
      await disposeCompilerOwner(runtimeState)
      await bundleRuntimeClassSetManager.reset()
    },
    getCompilerShadowRunSnapshot: () => getCompilerShadowRunSnapshot(runtimeState),
    watchChange,
  }
}
