import type { BundleSnapshot } from './bundle-state'
import type { InternalUserDefinedOptions } from '@/types'
import process from 'node:process'
import { COMPILATION_EVENT_SCHEMA_VERSION } from '@/compiler/events'
import { createCompilerRuntimeState } from '@/compiler/runtime-state'
import {
  collectRuntimeClassSet,
  createTailwindRuntimeReadyPromise,
  refreshTailwindRuntimeState,
} from '@/tailwindcss/runtime'
import { resolveTailwindcssOptions } from '@/tailwindcss/runtime-options'
import { getRuntimeClassSetSignature } from '@/tailwindcss/runtime/cache'
import { createBundleRuntimeClassSetManager } from './incremental-runtime-class-set'
import { createRuntimeClassSetCache } from './runtime-class-set/cache'

interface CreateViteRuntimeClassSetOptions {
  opts: InternalUserDefinedOptions
  initialTailwindRuntime: InternalUserDefinedOptions['tailwindRuntime']
  refreshTailwindcssRuntime: InternalUserDefinedOptions['refreshTailwindcssRuntime']
  uniAppXEnabled: boolean
  customAttributesEntities: unknown
  disabledDefaultTemplateHandler: boolean
  debug: (format: string, ...args: unknown[]) => void
}

export function createViteRuntimeClassSet(options: CreateViteRuntimeClassSetOptions) {
  const {
    opts,
    initialTailwindRuntime,
    refreshTailwindcssRuntime,
    uniAppXEnabled,
    customAttributesEntities,
    disabledDefaultTemplateHandler,
    debug,
  } = options
  const readyPromise = createTailwindRuntimeReadyPromise(initialTailwindRuntime)
  const runtimeState = createCompilerRuntimeState({
    tailwindRuntime: initialTailwindRuntime,
    readyPromise,
    refreshTailwindcssRuntime,
  })
  const bundleRuntimeClassSetManager = createBundleRuntimeClassSetManager({
    bareArbitraryValues: opts.arbitraryValues?.bareArbitraryValues,
    escapeMap: opts.escapeMap,
  })
  const transformRuntimeClassSetManager = createBundleRuntimeClassSetManager({
    bareArbitraryValues: opts.arbitraryValues?.bareArbitraryValues,
    escapeMap: opts.escapeMap,
  })
  const runtimeCache = createRuntimeClassSetCache({
    async refresh() {
      await refreshTailwindRuntimeState(runtimeState, { force: true, clearCache: true })
      await runtimeState.readyPromise
    },
    collect: () => collectRuntimeClassSet(runtimeState.tailwindRuntime, {
      force: true,
      skipRefresh: true,
      clearCache: true,
    }),
  })
  const disposeRuntimeState = runtimeState.dispose
  runtimeState.dispose = () => {
    runtimeCache.dispose()
    disposeRuntimeState()
  }
  let runtimeRefreshSignature: string | undefined
  let runtimeRefreshOptionsKey: string | undefined

  function resolveRuntimeRefreshOptions() {
    const configPath = resolveTailwindcssOptions(runtimeState.tailwindRuntime.options)?.config
    const signature = getRuntimeClassSetSignature(runtimeState.tailwindRuntime)
    const optionsKey = JSON.stringify({
      appType: opts.appType,
      uniAppX: uniAppXEnabled,
      customAttributesEntities,
      disabledDefaultTemplateHandler,
      configPath,
    })
    const changed = signature !== runtimeRefreshSignature || optionsKey !== runtimeRefreshOptionsKey
    runtimeRefreshSignature = signature
    runtimeRefreshOptionsKey = optionsKey
    return {
      changed,
      signature,
      optionsKey,
    }
  }

  function invalidateRuntimeClassSet() {
    runtimeCache.invalidate()
  }

  async function refreshRuntimeState(force: boolean) {
    const invalidation = resolveRuntimeRefreshOptions()
    if (force || invalidation.changed) {
      invalidateRuntimeClassSet()
    }
    await runtimeCache.refresh()
  }

  async function ensureRuntimeClassSet(force = false): Promise<Set<string>> {
    const startedAt = performance.now()
    const operationId = `vite-runtime-${Date.now()}-${runtimeState.revision}`
    const forceRuntimeRefresh = force || process.env['WEAPP_TW_VITE_FORCE_RUNTIME_REFRESH'] === '1'
    const invalidation = resolveRuntimeRefreshOptions()
    if (forceRuntimeRefresh || invalidation.changed) {
      invalidateRuntimeClassSet()
    }
    const cacheHit = runtimeCache.peek() !== undefined
    const result = await runtimeCache.get()
    await runtimeState.events.emit({ schemaVersion: COMPILATION_EVENT_SCHEMA_VERSION, type: 'diagnostic', timestamp: new Date().toISOString(), adapter: 'vite', phase: 'candidate', revision: runtimeState.revision, operationId, durationMs: performance.now() - startedAt, cache: { hit: cacheHit } })
    return result
  }

  async function ensureBundleRuntimeClassSet(
    snapshot: BundleSnapshot,
    forceRefresh = false,
    options: {
      allowBaselineOnlyInitialSync?: boolean | undefined
      baseClassSet?: Set<string> | undefined
      refreshBySource?: boolean | undefined
      transformOnly?: boolean | undefined
    } = {},
  ) {
    const startedAt = performance.now()
    const operationId = `vite-bundle-${Date.now()}-${runtimeState.revision}`
    const forceRuntimeRefresh = forceRefresh || process.env['WEAPP_TW_VITE_FORCE_RUNTIME_REFRESH'] === '1'
    const invalidation = resolveRuntimeRefreshOptions()
    const shouldRefreshRuntime = forceRuntimeRefresh || invalidation.changed
    const forceCollectBySource = snapshot.runtimeAffectingChangedByType.html.size > 0
      || snapshot.runtimeAffectingChangedByType.js.size > 0

    await refreshRuntimeState(shouldRefreshRuntime)
    await runtimeState.readyPromise

    if (shouldRefreshRuntime) {
      await bundleRuntimeClassSetManager.reset()
      await transformRuntimeClassSetManager.reset()
    }

    const expectedRevision = runtimeCache.revision()
    if (!forceRuntimeRefresh) {
      try {
        const baseClassSet = options.baseClassSet
          ?? await runtimeCache.get()
        const nextRuntimeSet = await bundleRuntimeClassSetManager.sync(runtimeState.tailwindRuntime, snapshot, {
          baseClassSet,
          skipInitialFullScanWithBase: options.allowBaselineOnlyInitialSync,
        })
        runtimeCache.remember(nextRuntimeSet, expectedRevision)
        await runtimeState.events.emit({ schemaVersion: COMPILATION_EVENT_SCHEMA_VERSION, type: 'diagnostic', timestamp: new Date().toISOString(), adapter: 'vite', phase: 'candidate', revision: runtimeState.revision, operationId, durationMs: performance.now() - startedAt, cache: { hit: !shouldRefreshRuntime }, evidence: ['bundle-runtime-sync'] })
        return nextRuntimeSet
      }
      catch (error) {
        debug('incremental runtime set sync failed, fallback to full collect: %O', error)
        await bundleRuntimeClassSetManager.reset()
      }
    }

    if (!forceRuntimeRefresh && !invalidation.changed && forceCollectBySource) {
      invalidateRuntimeClassSet()
    }
    const result = await runtimeCache.get()
    await runtimeState.events.emit({ schemaVersion: COMPILATION_EVENT_SCHEMA_VERSION, type: 'diagnostic', timestamp: new Date().toISOString(), adapter: 'vite', phase: 'candidate', revision: runtimeState.revision, operationId, durationMs: performance.now() - startedAt, cache: { hit: false }, evidence: ['runtime-class-scan'] })
    return result
  }

  return {
    runtimeState,
    refreshRuntimeState,
    invalidateRuntimeClassSet,
    ensureRuntimeClassSet,
    ensureBundleRuntimeClassSet,
  }
}
