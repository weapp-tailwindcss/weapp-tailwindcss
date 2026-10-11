import type {
  RefreshTailwindcssRuntimeOptions,
  TailwindcssRuntimeLike,
} from '@/types'
import { createDebug } from '@/debug'
import { createTailwindV4Engine, loadTailwindV4DesignSystem, resolveTailwindV4SourceFromRuntime, resolveValidTailwindV4Candidates } from '@/tailwindcss/v4-engine'
import { resolveCssMacroTailwindV4Source } from '@/tailwindcss/v4-engine/css-macro-source'
import { resolveRuntimeBareArbitraryValues } from './runtime-options'
import {
  getRuntimeClassSetCacheEntry,
  getRuntimeClassSetSignatureWithSources,
  invalidateRuntimeClassSet,
} from './runtime/cache'

const debug = createDebug('[tailwindcss:runtime] ')

export const refreshTailwindcssRuntimeSymbol = Symbol.for('weapp-tailwindcss.refreshTailwindcssRuntime')

export interface CollectRuntimeClassSetOptions {
  force?: boolean | undefined
  skipRefresh?: boolean | undefined
  clearCache?: boolean | undefined
}

export interface RefreshTailwindRuntimeStateOptions {
  force: boolean
  clearCache?: boolean | undefined
}

export function createTailwindRuntimeReadyPromise(
  tailwindRuntime: TailwindcssRuntimeLike,
): Promise<void> {
  return Promise.resolve().then(async () => {
    invalidateRuntimeClassSet(tailwindRuntime)
  })
}

export interface TailwindRuntimeState {
  tailwindRuntime: TailwindcssRuntimeLike
  readyPromise: Promise<void>
  refreshTailwindcssRuntime?: ((options?: RefreshTailwindcssRuntimeOptions) => Promise<TailwindcssRuntimeLike>) | undefined
}

interface RuntimeClassSetStateEntry {
  value?: Set<string> | undefined
  promise?: Promise<Set<string>> | undefined
  signature?: string | undefined
}

const runtimeClassSetStateCache = new WeakMap<TailwindRuntimeState, RuntimeClassSetStateEntry>()

function getRuntimeClassSetStateEntry(state: TailwindRuntimeState) {
  let entry = runtimeClassSetStateCache.get(state)
  if (!entry) {
    entry = {}
    runtimeClassSetStateCache.set(state, entry)
  }
  return entry
}

function getTailwindRuntime(state: TailwindRuntimeState) {
  return state.tailwindRuntime
}

function setTailwindRuntime(state: TailwindRuntimeState, runtime: TailwindcssRuntimeLike) {
  state.tailwindRuntime = runtime
}

function getRefreshTailwindRuntime(state: TailwindRuntimeState) {
  return state.refreshTailwindcssRuntime
}

export async function refreshTailwindRuntimeState(
  state: TailwindRuntimeState,
  forceOrOptions: boolean | RefreshTailwindRuntimeStateOptions,
): Promise<boolean> {
  const normalizedOptions = typeof forceOrOptions === 'boolean'
    ? { force: forceOrOptions }
    : forceOrOptions
  const force = normalizedOptions.force
  const clearCache = normalizedOptions.clearCache === true

  if (!force) {
    return false
  }

  const currentRuntime = getTailwindRuntime(state)
  debug('refresh runtime state start, clearCache=%s major=%s', clearCache, currentRuntime.majorVersion ?? 'unknown')
  await state.readyPromise

  let refreshed = false
  const refreshTailwindRuntime = getRefreshTailwindRuntime(state)
  if (typeof refreshTailwindRuntime === 'function') {
    const next = await refreshTailwindRuntime({ clearCache })
    if (next !== getTailwindRuntime(state)) {
      setTailwindRuntime(state, next)
    }
    refreshed = true
  }

  if (refreshed) {
    state.readyPromise = createTailwindRuntimeReadyPromise(getTailwindRuntime(state))
  }

  debug('refresh runtime state end, refreshed=%s major=%s', refreshed, getTailwindRuntime(state).majorVersion ?? 'unknown')
  return refreshed
}

export interface EnsureRuntimeClassSetOptions {
  forceRefresh?: boolean | undefined
  forceCollect?: boolean | undefined
  clearCache?: boolean | undefined
  allowEmpty?: boolean | undefined
}

export async function ensureRuntimeClassSet(
  state: TailwindRuntimeState,
  options: EnsureRuntimeClassSetOptions = {},
): Promise<Set<string>> {
  const forceRefresh = options.forceRefresh === true
  const forceCollect = options.forceCollect === true
  const clearCache = options.clearCache === true
  const allowEmpty = options.allowEmpty === true

  if (forceRefresh) {
    await refreshTailwindRuntimeState(state, {
      force: true,
      clearCache,
    })
  }

  await state.readyPromise

  const entry = getRuntimeClassSetStateEntry(state)
  const signature = await getRuntimeClassSetSignatureWithSources(getTailwindRuntime(state))
  const signatureChanged = entry.signature !== signature
  const shouldForceCollect = forceCollect || forceRefresh || signatureChanged

  if (!shouldForceCollect) {
    if (entry.value && (allowEmpty || entry.value.size > 0)) {
      return entry.value
    }
    if (entry.promise) {
      return entry.promise
    }
  }

  const task = (async () => {
    const collected = await collectRuntimeClassSet(getTailwindRuntime(state), {
      force: shouldForceCollect,
      skipRefresh: true,
      clearCache,
    })

    if (allowEmpty || collected.size > 0) {
      return collected
    }

    await refreshTailwindRuntimeState(state, {
      force: true,
      clearCache: true,
    })
    await state.readyPromise
    return collectRuntimeClassSet(getTailwindRuntime(state), {
      force: true,
      skipRefresh: true,
      clearCache: true,
    })
  })()

  entry.promise = task

  try {
    const runtimeSet = await task
    entry.value = runtimeSet
    entry.signature = await getRuntimeClassSetSignatureWithSources(getTailwindRuntime(state))
    return runtimeSet
  }
  finally {
    if (entry.promise === task) {
      entry.promise = undefined
    }
  }
}

function tryGetRuntimeClassSetSync(tailwindRuntime: TailwindcssRuntimeLike) {
  if (typeof tailwindRuntime.getClassSetSync !== 'function') {
    return undefined
  }

  try {
    const set = tailwindRuntime.getClassSetSync()
    if (set && set.size === 0) {
      // 空集合通常意味着运行时尚未真正执行提取，继续走异步路径
      return undefined
    }
    return set
  }
  catch (error) {
    debug('getClassSetSync() unavailable for tailwindcss v4, fallback to async getClassSet(): %O', error)
    return undefined
  }
}

async function collectTailwindV4GeneratorClassSet(tailwindRuntime: TailwindcssRuntimeLike) {
  if (typeof tailwindRuntime.collectContentTokens !== 'function') {
    return undefined
  }

  try {
    const source = resolveCssMacroTailwindV4Source(await resolveTailwindV4SourceFromRuntime(tailwindRuntime))
    const bareArbitraryValues = resolveRuntimeBareArbitraryValues(tailwindRuntime.options)
    const generated = await createTailwindV4Engine(source).generate({
      ...(bareArbitraryValues === undefined ? {} : { bareArbitraryValues }),
      scanSources: true,
      target: 'web',
    })
    const designSystem = await loadTailwindV4DesignSystem(source)
    const classSet = resolveValidTailwindV4Candidates(designSystem, generated.classSet, {
      ...(bareArbitraryValues === undefined ? {} : { bareArbitraryValues }),
    })
    debug('runtime class set resolved via tailwindcss v4 generator source scan, raw=%d valid=%d', generated.classSet.size, classSet.size)
    return classSet
  }
  catch (error) {
    debug('tailwindcss v4 generator source scan failed, continuing fallback chain: %O', error)
    return undefined
  }
}

async function mergeTailwindV4GeneratorClassSet(
  tailwindRuntime: TailwindcssRuntimeLike,
  classSet: Set<string>,
) {
  const generatorClassSet = await collectTailwindV4GeneratorClassSet(tailwindRuntime).catch(() => undefined)
  if (!generatorClassSet || generatorClassSet.size === 0) {
    return classSet
  }
  return new Set([
    ...classSet,
    ...generatorClassSet,
  ])
}

async function collectRuntimeClassSet(
  tailwindRuntime: TailwindcssRuntimeLike,
  options: CollectRuntimeClassSetOptions = {},
): Promise<Set<string>> {
  type RefreshableRuntime = TailwindcssRuntimeLike & {
    [refreshTailwindcssRuntimeSymbol]?: (options?: RefreshTailwindcssRuntimeOptions) => Promise<TailwindcssRuntimeLike>
  }

  let activeRuntime = tailwindRuntime as RefreshableRuntime

  if (options.force && !options.skipRefresh) {
    const refresh = activeRuntime[refreshTailwindcssRuntimeSymbol]
    if (typeof refresh === 'function') {
      try {
        const refreshed = await refresh({ clearCache: options.clearCache === true })
        if (refreshed) {
          activeRuntime = refreshed as RefreshableRuntime
        }
      }
      catch (error) {
        debug('refreshTailwindcssRuntime failed, continuing with existing runtime: %O', error)
      }
    }
  }

  const entry = getRuntimeClassSetCacheEntry(activeRuntime)
  const signature = await getRuntimeClassSetSignatureWithSources(activeRuntime)

  if (!options.force) {
    if (entry.value && entry.signature === signature) {
      return entry.value
    }
    if (entry.promise) {
      return entry.promise
    }
  }
  else {
    entry.value = undefined
  }

  const task = (async () => {
    // 强制收集时优先走 extract()：
    // 在多构建/热更新场景下，sync class set 可能受上轮缓存影响而滞后，
    // 先用 extract() 能拿到更接近当前源码状态的类集合。
    const preferExtract = options.force === true

    try {
      const result = await activeRuntime.extract({ write: false })
      if (result?.classSet) {
        if (result.classSet.size > 0) {
          const merged = await mergeTailwindV4GeneratorClassSet(activeRuntime, result.classSet)
          debug('runtime class set resolved via extract() + tailwindcss v4 source scan, extract=%d merged=%d', result.classSet.size, merged.size)
          return merged
        }
        if (preferExtract) {
          debug('runtime class set from extract() is empty on force collect, fallback to generator/sync/async class set')
        }
        else {
          debug('runtime class set from extract() is empty, fallback to sync/async class set')
        }
      }
    }
    catch (error) {
      debug('extract() failed, fallback to getClassSet(): %O', error)
    }

    const generatorClassSet = await collectTailwindV4GeneratorClassSet(activeRuntime)
    if (generatorClassSet && generatorClassSet.size > 0) {
      return generatorClassSet
    }

    const syncSet = tryGetRuntimeClassSetSync(activeRuntime)
    if (syncSet) {
      debug('runtime class set resolved via getClassSetSync(), size=%d', syncSet.size)
      return syncSet
    }

    try {
      const fallbackSet = await Promise.resolve(activeRuntime.getClassSet())
      if (fallbackSet) {
        debug('runtime class set resolved via getClassSet(), size=%d', fallbackSet.size)
        return fallbackSet
      }
    }
    catch (error) {
      debug('getClassSet() failed, returning empty set: %O', error)
    }

    return new Set<string>()
  })()

  entry.promise = task
  entry.signature = signature

  try {
    const resolved = await task
    entry.value = resolved
    entry.promise = undefined
    entry.signature = signature
    return resolved
  }
  catch (error) {
    entry.promise = undefined
    throw error
  }
}

export { collectRuntimeClassSet, invalidateRuntimeClassSet }
