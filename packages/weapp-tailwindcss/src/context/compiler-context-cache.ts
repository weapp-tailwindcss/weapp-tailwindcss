import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import process from 'node:process'
import { logger } from '@weapp-tailwindcss/logger'
import { md5Hash } from '@/cache/md5'
import { generatorTargetEnvKeys } from '@/runtime-branch/generator-target-env'

const PAREN_CONTENT_RE = /\(([^)]+)\)/u
const AT_LOCATION_RE = /at\s+(\S.*)$/u
const TRAILING_LINE_COL_RE = /:\d+(?::\d+)?$/u
const DEFAULT_COMPILER_CONTEXT_CACHE_MAX = 32
const DEFAULT_COMPILER_CONTEXT_KEY_CACHE_MAX = DEFAULT_COMPILER_CONTEXT_CACHE_MAX * 2

type NormalizedOptionsPrimitive = string | number | boolean | null
interface NormalizedOptionsArray extends Array<NormalizedOptionsValue> {}
interface NormalizedOptionsRecord {
  [key: string]: NormalizedOptionsValue
}
type NormalizedOptionsValue
  = | NormalizedOptionsPrimitive
    | NormalizedOptionsArray
    | NormalizedOptionsRecord

interface GlobalCompilerContextCacheHolder {
  __WEAPP_TW_COMPILER_CONTEXT_CACHE__?: Map<string, InternalUserDefinedOptions>
}

const globalCacheHolder = globalThis as GlobalCompilerContextCacheHolder
const compilerContextCache: Map<string, InternalUserDefinedOptions> = globalCacheHolder.__WEAPP_TW_COMPILER_CONTEXT_CACHE__
  ?? (globalCacheHolder.__WEAPP_TW_COMPILER_CONTEXT_CACHE__ = new Map())
const compilerContextKeyCacheByOptions = new WeakMap<UserDefinedOptions, Map<string, string | undefined>>()
const compilerContextKeyCacheWithoutOptions = new Map<string, string | undefined>()

function resolveCompilerContextCacheMax(defaultValue: number) {
  const raw = Number.parseInt(process.env['WEAPP_TW_COMPILER_CONTEXT_CACHE_MAX'] ?? '', 10)
  if (!Number.isFinite(raw) || raw <= 0) {
    return defaultValue
  }
  return Math.floor(raw)
}

function touchMapValue<Value>(map: Map<string, Value>, key: string, value: Value) {
  map.delete(key)
  map.set(key, value)
}

function pruneMapToMaxSize<Value>(map: Map<string, Value>, maxSize: number) {
  while (map.size > maxSize) {
    const firstKey = map.keys().next().value
    if (firstKey === undefined) {
      break
    }
    map.delete(firstKey)
  }
}

function withCircularGuard<T extends object>(
  value: T,
  stack: WeakSet<object>,
  factory: () => NormalizedOptionsValue,
): NormalizedOptionsValue {
  if (stack.has(value)) {
    throw new TypeError('Cannot serialize circular structure in compiler context options')
  }
  stack.add(value)
  try {
    return factory()
  }
  finally {
    stack.delete(value)
  }
}

function encodeTaggedValue(type: string, value?: NormalizedOptionsValue): Record<string, NormalizedOptionsValue> {
  const record: Record<string, NormalizedOptionsValue> = { __type: type }
  if (value !== undefined) {
    record['value'] = value
  }
  return record
}

function hasExplicitOptionBasedir(opts?: UserDefinedOptions) {
  return typeof opts?.tailwindcssBasedir === 'string' && opts.tailwindcssBasedir.length > 0
}

function shouldProbeCallerLocation(opts?: UserDefinedOptions) {
  if (hasExplicitOptionBasedir(opts)) {
    return false
  }

  return !(
    process.env['WEAPP_TAILWINDCSS_BASEDIR']
    || process.env['WEAPP_TAILWINDCSS_BASE_DIR']
    || process.env['TAILWINDCSS_BASEDIR']
    || process.env['TAILWINDCSS_BASE_DIR']
  )
}

function detectCallerLocation() {
  const stack = new Error('compiler-context-cache stack probe').stack
  if (!stack) {
    return undefined
  }

  const lines = stack.split('\n')
  for (const line of lines) {
    const match = line.match(PAREN_CONTENT_RE) ?? line.match(AT_LOCATION_RE)
    const location = match?.[1]
    if (!location) {
      continue
    }

    const candidatePath = location.replace(TRAILING_LINE_COL_RE, '')
    if (!candidatePath || !path.isAbsolute(candidatePath)) {
      continue
    }

    // 跳过 weapp-tailwindcss 内部调用栈，确保 caller 提示在不同封装层下保持稳定。
    if (
      candidatePath.includes(`${path.sep}weapp-tailwindcss${path.sep}src${path.sep}`)
      || candidatePath.includes(`${path.sep}weapp-tailwindcss${path.sep}dist${path.sep}`)
      || candidatePath.includes(`${path.sep}node_modules${path.sep}weapp-tailwindcss${path.sep}`)
    ) {
      continue
    }

    return candidatePath
  }

  return undefined
}

function getRuntimeCacheScope(opts?: UserDefinedOptions) {
  // 显式项目根目录只固定来源身份，框架平台与生成目标仍会随本轮环境变化。
  const generatorEnvironment = Object.fromEntries(generatorTargetEnvKeys.map(key => [key, process.env[key]]))
  // 为什么把 runtime scope 纳入 cache key：
  // 在 e2e/watch 场景中，同一个 Node 进程会连续构建多个 demo 项目。
  // 有些调用方依赖隐式 basedir 推导（未显式传 tailwindcssBasedir），
  // 这会依赖 env/cwd/package 语境。如果 cache key 只包含用户 options，
  // 不同项目会误复用同一 context，最终导致 class-set 错配、WXML 转义异常。
  if (hasExplicitOptionBasedir(opts)) {
    return {
      caller: undefined as string | undefined,
      generatorEnvironment,
    }
  }

  const runtimeScope = {
    caller: undefined as string | undefined,
    generatorEnvironment,
    cwd: process.cwd(),
    init_cwd: process.env['INIT_CWD'],
    npm_config_local_prefix: process.env['npm_config_local_prefix'],
    npm_package_json: process.env['npm_package_json'],
    pnpm_package_name: process.env['PNPM_PACKAGE_NAME'],
    pwd: process.env['PWD'],
    tailwindcss_base_dir: process.env['TAILWINDCSS_BASE_DIR'],
    tailwindcss_basedir: process.env['TAILWINDCSS_BASEDIR'],
    uni_app_input_dir: process.env['UNI_APP_INPUT_DIR'],
    uni_cli_root: process.env['UNI_CLI_ROOT'],
    uni_input_dir: process.env['UNI_INPUT_DIR'],
    uni_input_root: process.env['UNI_INPUT_ROOT'],
    weapp_tailwindcss_base_dir: process.env['WEAPP_TAILWINDCSS_BASE_DIR'],
    weapp_tailwindcss_basedir: process.env['WEAPP_TAILWINDCSS_BASEDIR'],
  }
  if (shouldProbeCallerLocation(opts)) {
    runtimeScope.caller = detectCallerLocation()
  }

  return runtimeScope
}

function serializeNormalizedValue(value: NormalizedOptionsValue) {
  return JSON.stringify(value)
}

function createRuntimeCacheScopeKey(opts?: UserDefinedOptions) {
  return serializeNormalizedValue(normalizeOptionsValue(getRuntimeCacheScope(opts)))
}

function getCompilerContextKeyCacheStore(opts?: UserDefinedOptions) {
  if (!opts) {
    return compilerContextKeyCacheWithoutOptions
  }

  let store = compilerContextKeyCacheByOptions.get(opts)
  if (!store) {
    store = new Map<string, string | undefined>()
    compilerContextKeyCacheByOptions.set(opts, store)
  }
  return store
}

interface ComparableNormalizedValue {
  normalized: NormalizedOptionsValue
  sortKey: string
}

function createComparableNormalizedValue(
  rawValue: unknown,
  stack: WeakSet<object>,
): ComparableNormalizedValue {
  const normalized = normalizeOptionsValue(rawValue, stack)
  return {
    normalized,
    sortKey: serializeNormalizedValue(normalized),
  }
}

function getRuntimeCacheScopeValue(opts?: UserDefinedOptions) {
  return {
    options: opts ?? {},
    runtime: getRuntimeCacheScope(opts),
  }
}

function normalizeOptionsValue(
  rawValue: unknown,
  stack: WeakSet<object> = new WeakSet<object>(),
): NormalizedOptionsValue {
  if (rawValue === null) {
    return null
  }
  if (rawValue === undefined) {
    return encodeTaggedValue('Undefined')
  }

  const type = typeof rawValue
  if (type === 'string') {
    return rawValue as string
  }
  if (type === 'boolean') {
    return rawValue as boolean
  }
  if (type === 'number') {
    const numericValue = rawValue as number
    if (Number.isNaN(numericValue)) {
      return encodeTaggedValue('Number', 'NaN')
    }
    if (!Number.isFinite(numericValue)) {
      return encodeTaggedValue('Number', numericValue > 0 ? 'Infinity' : '-Infinity')
    }
    if (Object.is(numericValue, -0)) {
      return encodeTaggedValue('Number', '-0')
    }
    return numericValue
  }
  if (type === 'bigint') {
    return encodeTaggedValue('BigInt', (rawValue as bigint).toString())
  }
  if (type === 'symbol') {
    const symbolValue = rawValue as symbol
    return encodeTaggedValue('Symbol', symbolValue.description ?? String(symbolValue))
  }
  if (type === 'function') {
    return encodeTaggedValue('Function', (rawValue as (...args: unknown[]) => unknown).toString())
  }

  if (Array.isArray(rawValue)) {
    return withCircularGuard(rawValue, stack, () => rawValue.map(item => normalizeOptionsValue(item, stack)))
  }
  if (rawValue instanceof Date) {
    return encodeTaggedValue('Date', rawValue.toISOString())
  }
  if (rawValue instanceof RegExp) {
    return {
      __type: 'RegExp',
      source: rawValue.source,
      flags: rawValue.flags,
    } as Record<string, NormalizedOptionsValue>
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(rawValue)) {
    return encodeTaggedValue('Buffer', (rawValue as Buffer).toString('base64'))
  }
  if (ArrayBuffer.isView(rawValue)) {
    const view = rawValue as ArrayBufferView
    const buffer = Buffer.from(view.buffer, view.byteOffset, view.byteLength)
    return encodeTaggedValue(view.constructor?.name ?? 'ArrayBufferView', buffer.toString('base64'))
  }
  if (rawValue instanceof ArrayBuffer) {
    return encodeTaggedValue('ArrayBuffer', Buffer.from(rawValue).toString('base64'))
  }
  if (rawValue instanceof Set) {
    return withCircularGuard(rawValue, stack, () => {
      const normalizedEntries = Array.from(rawValue, element => createComparableNormalizedValue(element, stack))
      normalizedEntries.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      return {
        __type: 'Set',
        value: normalizedEntries.map(entry => entry.normalized),
      }
    }) as Record<string, NormalizedOptionsValue>
  }
  if (rawValue instanceof Map) {
    return withCircularGuard(rawValue, stack, () => {
      const normalizedEntries = Array.from(rawValue.entries(), ([key, entryValue]) => {
        const normalizedKey = createComparableNormalizedValue(key, stack)
        return {
          key: normalizedKey.normalized,
          sortKey: normalizedKey.sortKey,
          value: normalizeOptionsValue(entryValue, stack),
        }
      })
      normalizedEntries.sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      return {
        __type: 'Map',
        value: normalizedEntries.map(entry => [entry.key, entry.value]),
      }
    }) as Record<string, NormalizedOptionsValue>
  }
  if (typeof URL !== 'undefined' && rawValue instanceof URL) {
    return encodeTaggedValue('URL', rawValue.toString())
  }
  if (rawValue instanceof Error) {
    const errorValue = rawValue as Error
    return {
      __type: 'Error',
      name: errorValue.name,
      message: errorValue.message,
      stack: errorValue.stack ?? '',
    } as Record<string, NormalizedOptionsValue>
  }
  if (rawValue instanceof Promise) {
    return encodeTaggedValue('Promise')
  }
  if (rawValue instanceof WeakMap) {
    return encodeTaggedValue('WeakMap')
  }
  if (rawValue instanceof WeakSet) {
    return encodeTaggedValue('WeakSet')
  }
  if (rawValue && typeof rawValue === 'object') {
    return withCircularGuard(rawValue as Record<string, unknown>, stack, () => {
      const result: Record<string, NormalizedOptionsValue> = {}
      const entries = Object.entries(rawValue as Record<string, unknown>)
      entries.sort(([a], [b]) => a.localeCompare(b))
      for (const [key, entryValue] of entries) {
        result[key] = normalizeOptionsValue(entryValue, stack)
      }
      return result
    })
  }
  return encodeTaggedValue(typeof rawValue, String(rawValue))
}

export function createCompilerContextCacheKey(opts?: UserDefinedOptions): string | undefined {
  try {
    const runtimeCacheScopeKey = createRuntimeCacheScopeKey(opts)
    const keyStore = getCompilerContextKeyCacheStore(opts)
    const cached = keyStore.get(runtimeCacheScopeKey)
    if (cached !== undefined) {
      return cached
    }

    // 缓存键同时包含「静态 options + 动态 runtime scope」：
    // 即便 options 字面量完全一致，也要避免跨项目命中同一 compiler context。
    const normalized = normalizeOptionsValue(getRuntimeCacheScopeValue(opts))
    const cacheKey = md5Hash(serializeNormalizedValue(normalized))
    touchMapValue(keyStore, runtimeCacheScopeKey, cacheKey)
    pruneMapToMaxSize(keyStore, resolveCompilerContextCacheMax(DEFAULT_COMPILER_CONTEXT_KEY_CACHE_MAX))
    return cacheKey
  }
  catch (error) {
    logger.debug('skip compiler context cache: %O', error)
    return undefined
  }
}

export function withCompilerContextCache(
  opts: UserDefinedOptions | undefined,
  factory: () => InternalUserDefinedOptions,
): InternalUserDefinedOptions {
  const cacheKey = createCompilerContextCacheKey(opts)
  if (cacheKey) {
    const cached = compilerContextCache.get(cacheKey)
    if (cached) {
      touchMapValue(compilerContextCache, cacheKey, cached)
      return cached
    }
  }

  const ctx = factory()
  if (cacheKey) {
    touchMapValue(compilerContextCache, cacheKey, ctx)
    pruneMapToMaxSize(compilerContextCache, resolveCompilerContextCacheMax(DEFAULT_COMPILER_CONTEXT_CACHE_MAX))
  }
  return ctx
}
