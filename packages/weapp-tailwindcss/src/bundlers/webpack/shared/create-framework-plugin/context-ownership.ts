import type { ICreateCacheReturnType } from '@/cache'
import type { CompilerRuntimeState } from '@/compiler/runtime-state'
import type { InternalUserDefinedOptions, UserDefinedOptions } from '@/types'
import { createCache } from '@/cache'
import { createCompilerContext } from '@/context'
import { getCompilerContextSourceOptions } from '@/context/source-options'

interface OwnedContext {
  context: InternalUserDefinedOptions
  sourceOptions: UserDefinedOptions
  ownedCache?: ICreateCacheReturnType | undefined
}
const transfers = new WeakMap<object, OwnedContext>()

function closedOperation(): never {
  throw new Error('Webpack 编译上下文已释放，不能继续使用。')
}

const closedStyleHandler = Object.assign(closedOperation, { transformRoot: closedOperation, getPipeline: closedOperation })

/** 公开组装入口显式转交自己创建的 context；普通传入对象不会被推断为所有权转移。 */
export function transferWebpackContext(context: InternalUserDefinedOptions, options: UserDefinedOptions) {
  transfers.set(context, { context, sourceOptions: getCompilerContextSourceOptions(options), ownedCache: typeof options.cache === 'object' ? undefined : context.cache })
  return context
}

export function createWebpackContext(options: UserDefinedOptions | InternalUserDefinedOptions): OwnedContext {
  const transferred = transfers.get(options)
  if (transferred) {
    transfers.delete(options)
    return transferred
  }
  const sourceOptions = getCompilerContextSourceOptions(options)
  const context = createCompilerContext({ ...sourceOptions, __internalDeferMissingCssEntriesWarning: true } as UserDefinedOptions)
  const internal = options as Partial<InternalUserDefinedOptions>
  // 兼容内部调用者显式覆盖的转换操作，但 runtime 和默认 cache 仍由新实例创建。
  if (typeof internal.refreshTailwindcssRuntime === 'function' && internal.tailwindRuntime) {
    if (internal.styleHandler) {
      context.styleHandler = internal.styleHandler
    }
    if (internal.jsHandler) {
      context.jsHandler = internal.jsHandler
    }
    if (internal.templateHandler) {
      context.templateHandler = internal.templateHandler
    }
  }
  return { context, sourceOptions, ownedCache: typeof sourceOptions.cache === 'object' ? undefined : context.cache }
}

/** 只在既有关闭协调者排空并释放核心后调用，不负责建立另一套生命周期。 */
export function releaseWebpackContext(owned: OwnedContext, runtime?: CompilerRuntimeState) {
  const context = owned.context
  const errors: unknown[] = []
  const cache = owned.ownedCache
  owned.ownedCache = undefined
  if (cache) {
    for (const clear of [() => cache.instance.clear(), () => cache.hashMap.clear()]) {
      try {
        clear()
      }
      catch (error) {
        errors.push(error)
      }
    }
  }
  // 对象保持可观察的关闭终态，同时切断 handler、运行时刷新闭包和外部 cache 的引用。
  context.styleHandler = closedStyleHandler
  context.jsHandler = closedOperation
  context.templateHandler = closedOperation
  context.refreshTailwindcssRuntime = closedOperation
  context.tailwindRuntime = { packageInfo: context.tailwindRuntime.packageInfo, majorVersion: context.tailwindRuntime.majorVersion, getClassSet: closedOperation, extract: closedOperation }
  context.cache = createCache(false)
  if (runtime) {
    runtime.tailwindRuntime = context.tailwindRuntime
    runtime.refreshTailwindcssRuntime = closedOperation
    runtime.readyPromise = Promise.resolve()
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Webpack 上下文释放失败，已断开其余资源。')
  }
}
