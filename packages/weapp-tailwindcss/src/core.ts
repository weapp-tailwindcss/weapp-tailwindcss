import type { CompilationDiagnosticEvent } from './compiler/events'
import type { CreateJsHandlerOptions, IStyleHandlerOptions, ITemplateHandlerOptions, UserDefinedOptions } from './types'
import { performance } from 'node:perf_hooks'
import { defuOverrideArray } from '@weapp-tailwindcss/shared'
import { getCompilerContext } from '@/context'
import { shouldSkipJsTransform } from '@/js/precheck'
import { createTailwindRuntimeReadyPromise, ensureRuntimeClassSet } from '@/tailwindcss/runtime'
import { COMPILATION_EVENT_SCHEMA_VERSION } from './compiler/events'
import { createCompilerRuntimeState } from './compiler/runtime-state'

export { createCompilationEventBus, createCompilerRuntimeState } from './compiler'
export type { CompilationEvent, CompilerHost, CompilerRuntimeState } from './compiler'
export type {
  Compiler,
  CompilerCacheReuseState,
  CompilerCssTransformOptions,
  CompilerGenerateRequest,
  CompilerGenerateResult,
  CompilerSnapshot,
  CompilerSnapshotRoot,
  CompilerSourcePattern,
  CompilerTarget,
  CompilerTemplateTransformOptions,
  CreateCompilerOptions,
  CreateCompilerSnapshotRequest,
} from './core/compiler'
export { createCompiler } from './core/compiler'
export {
  finalizeMiniProgramCss,
  finalizeMiniProgramCssRoot,
  postcss,
  removeTailwindSourceDirectivesRoot,
} from '@weapp-tailwindcss/postcss/transform'
export type { FinalizeMiniProgramCssOptions } from '@weapp-tailwindcss/postcss/transform'

type RuntimeJsTransformOptions = { runtimeSet?: Set<string> } & CreateJsHandlerOptions

export interface GetRuntimeSetOptions {
  /** 强制刷新 Tailwind 运行时状态后再收集 */
  forceRefresh?: boolean | undefined
  /** 强制重新提取运行时类名集合 */
  forceCollect?: boolean | undefined
  /** 刷新时同步清理 Tailwind 运行时缓存 */
  clearCache?: boolean | undefined
  /** 允许返回空集合，默认会在空集合时再尝试刷新一次 */
  allowEmpty?: boolean | undefined
}

const DEFAULT_MAIN_CHUNK_STYLE_OPTIONS = Object.freeze({
  isMainChunk: true,
}) satisfies Readonly<Partial<IStyleHandlerOptions>>

function resolveTransformWxssOptions(options?: Partial<IStyleHandlerOptions>) {
  if (!options) {
    return DEFAULT_MAIN_CHUNK_STYLE_OPTIONS
  }

  if (options.isMainChunk === true) {
    return options
  }

  return defuOverrideArray(options, DEFAULT_MAIN_CHUNK_STYLE_OPTIONS)
}

/**
 * 创建一个上下文对象，用于处理小程序的模板、样式和脚本转换。
 * @param options - 用户定义的选项对象
 * @returns 返回一个包含 transformWxss、transformWxml 和 transformJs 方法的对象
 */
export function createContext(options: UserDefinedOptions = {}) {
  const opts = getCompilerContext(options)
  const { templateHandler, styleHandler, jsHandler } = opts
  const initialTailwindRuntime = opts.tailwindRuntime
  const refreshTailwindcssRuntime = opts.refreshTailwindcssRuntime

  const readyPromise = createTailwindRuntimeReadyPromise(initialTailwindRuntime)

  let runtimeSet = new Set<string>()
  const runtimeState = createCompilerRuntimeState({
    tailwindRuntime: initialTailwindRuntime,
    readyPromise,
    refreshTailwindcssRuntime,
  })
  const defaultJsHandlerOptionsCache = new Map<number, CreateJsHandlerOptions>()
  const diagnosticEvents: CompilationDiagnosticEvent[] = []
  runtimeState.events.subscribe((event) => {
    if (event.type === 'diagnostic') {
      diagnosticEvents.push(event)
    }
  })

  async function emitDiagnostic(phase: CompilationDiagnosticEvent['phase'], startedAt: number, operationId: string, error?: unknown) {
    await runtimeState.events.emit({
      schemaVersion: COMPILATION_EVENT_SCHEMA_VERSION,
      type: 'diagnostic',
      timestamp: new Date().toISOString(),
      compilerId: 'weapp-tailwindcss',
      phase,
      revision: runtimeState.revision,
      operationId,
      durationMs: performance.now() - startedAt,
      ...(error ? { error: { ...(error instanceof Error ? { name: error.name } : {}), message: error instanceof Error ? error.message : String(error) } } : {}),
    })
  }

  function getDefaultJsHandlerOptions(majorVersion = runtimeState.tailwindRuntime.majorVersion) {
    if (typeof majorVersion !== 'number') {
      return undefined
    }

    let cached = defaultJsHandlerOptionsCache.get(majorVersion)
    if (!cached) {
      cached = {
        tailwindcssMajorVersion: majorVersion,
      }
      defaultJsHandlerOptionsCache.set(majorVersion, cached)
    }
    return cached
  }

  function withRuntimeTailwindMajorVersion(options?: CreateJsHandlerOptions) {
    if (!options) {
      return getDefaultJsHandlerOptions()
    }

    if (typeof options.tailwindcssMajorVersion === 'number') {
      return options
    }

    const majorVersion = runtimeState.tailwindRuntime.majorVersion
    if (typeof majorVersion !== 'number') {
      return options
    }

    return {
      ...options,
      tailwindcssMajorVersion: majorVersion,
    }
  }

  function resolveTransformJsOptions(options?: RuntimeJsTransformOptions): CreateJsHandlerOptions | undefined {
    if (!options) {
      return getDefaultJsHandlerOptions()
    }

    let hasHandlerOption = false
    let runtimeSetProvided = false
    for (const key in options) {
      if (key === 'runtimeSet') {
        runtimeSetProvided = true
        continue
      }
      hasHandlerOption = true
      break
    }

    if (!hasHandlerOption) {
      return getDefaultJsHandlerOptions()
    }

    if (!runtimeSetProvided && typeof options.tailwindcssMajorVersion === 'number') {
      return options
    }

    if (runtimeSetProvided) {
      const { runtimeSet: _runtimeSet, ...handlerOptions } = options
      return withRuntimeTailwindMajorVersion(handlerOptions)
    }

    return withRuntimeTailwindMajorVersion(options)
  }

  const runtimeAwareTemplateJsHandler = (
    source: string,
    runtime?: Set<string>,
    handlerOptions?: CreateJsHandlerOptions,
  ) => {
    return jsHandler(source, runtime, withRuntimeTailwindMajorVersion(handlerOptions))
  }
  let cachedDefaultTemplateHandlerOptions: ITemplateHandlerOptions | undefined
  let cachedDefaultTemplateRuntimeSet: Set<string> | undefined
  let cachedRuntimeOnlyTemplateHandlerOptions: ITemplateHandlerOptions | undefined
  let cachedRuntimeOnlyTemplateRuntimeSet: Set<string> | undefined

  function getDefaultTemplateHandlerOptions() {
    if (cachedDefaultTemplateRuntimeSet !== runtimeSet || !cachedDefaultTemplateHandlerOptions) {
      cachedDefaultTemplateRuntimeSet = runtimeSet
      cachedDefaultTemplateHandlerOptions = {
        runtimeSet,
        jsHandler: runtimeAwareTemplateJsHandler,
      }
    }
    return cachedDefaultTemplateHandlerOptions
  }

  function resolveTransformWxmlOptions(options?: ITemplateHandlerOptions) {
    if (!options) {
      return getDefaultTemplateHandlerOptions()
    }

    let hasOverride = false
    for (const key in options) {
      if (key !== 'runtimeSet') {
        hasOverride = true
        break
      }
    }

    if (!hasOverride) {
      const runtimeOverride = options.runtimeSet
      if (runtimeOverride === undefined || runtimeOverride === runtimeSet) {
        return getDefaultTemplateHandlerOptions()
      }

      if (cachedRuntimeOnlyTemplateRuntimeSet !== runtimeOverride || !cachedRuntimeOnlyTemplateHandlerOptions) {
        cachedRuntimeOnlyTemplateRuntimeSet = runtimeOverride
        cachedRuntimeOnlyTemplateHandlerOptions = {
          runtimeSet: runtimeOverride,
          jsHandler: runtimeAwareTemplateJsHandler,
        }
      }
      return cachedRuntimeOnlyTemplateHandlerOptions
    }

    return defuOverrideArray(options, {
      runtimeSet,
      jsHandler: runtimeAwareTemplateJsHandler,
    })
  }

  async function transformWxss(rawCss: string, options?: Partial<IStyleHandlerOptions>) {
    await runtimeState.readyPromise
    const startedAt = performance.now()
    const operationId = `css-${Date.now()}-${runtimeState.revision}`
    try {
      const result = await styleHandler(rawCss, resolveTransformWxssOptions(options))
      runtimeSet = await ensureRuntimeClassSet(runtimeState)
      await emitDiagnostic('postcss', startedAt, operationId)
      return result
    }
    catch (error) {
      await emitDiagnostic('postcss', startedAt, operationId, error)
      throw error
    }
  }

  async function getRuntimeSet(options?: GetRuntimeSetOptions) {
    await runtimeState.readyPromise
    runtimeSet = await ensureRuntimeClassSet(runtimeState, options)
    return runtimeSet
  }

  async function transformJs(rawJs: string, options?: RuntimeJsTransformOptions) {
    await runtimeState.readyPromise
    if (options?.runtimeSet) {
      runtimeSet = options.runtimeSet
    }
    else if (runtimeSet.size === 0) {
      runtimeSet = await ensureRuntimeClassSet(runtimeState, {
        forceCollect: true,
      })
    }
    const resolvedOptions = resolveTransformJsOptions(options)
    if (shouldSkipJsTransform(rawJs, resolvedOptions)) {
      return { code: rawJs }
    }
    const startedAt = performance.now()
    const operationId = `js-${Date.now()}-${runtimeState.revision}`
    try {
      const result = await jsHandler(rawJs, runtimeSet, resolvedOptions)
      await emitDiagnostic('candidate', startedAt, operationId)
      return result
    }
    catch (error) {
      await emitDiagnostic('candidate', startedAt, operationId, error)
      throw error
    }
  }

  async function transformWxml(rawWxml: string, options?: ITemplateHandlerOptions) {
    await runtimeState.readyPromise
    if (!options?.runtimeSet && runtimeSet.size === 0) {
      runtimeSet = await ensureRuntimeClassSet(runtimeState, {
        forceCollect: true,
      })
    }
    const startedAt = performance.now()
    const operationId = `template-${Date.now()}-${runtimeState.revision}`
    try {
      const result = templateHandler(rawWxml, resolveTransformWxmlOptions(options))
      await emitDiagnostic('scan', startedAt, operationId)
      return result
    }
    catch (error) {
      await emitDiagnostic('scan', startedAt, operationId, error)
      throw error
    }
  }

  return {
    getRuntimeSet,
    transformWxss,
    transformWxml,
    transformJs,
    events: runtimeState.events,
    getDiagnosticEvents: () => diagnosticEvents.slice(),
  }
}
