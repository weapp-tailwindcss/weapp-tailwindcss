import type { Plugin, ResolvedConfig } from 'vite'
import type { VitePluginClosingHook, VitePluginOwnership } from './plugin-cleanup-bridge'
import type { createPluginInvocationSession } from './plugin-invocation-session'
import type { VitePluginSlot } from './plugin-slots'
import { claimVitePluginCleanup, getVitePluginCleanup } from './plugin-cleanup-bridge'

type ClosingHook = VitePluginClosingHook

/** watch 的轮次结束可以恢复，serve 的 closeBundle 则是永久关闭。 */
export function isPermanentViteHook(config: ResolvedConfig, hook: string, error?: unknown) {
  const watchBuild = config.command === 'build' && config.build?.watch != null
  return hook === 'closeWatcher'
    || (hook === 'closeBundle' && !watchBuild)
    || (hook === 'buildEnd' && Boolean(error) && config.command === 'build' && !watchBuild)
}

function handlerOf(hook: unknown) {
  return typeof hook === 'function'
    ? hook
    : hook && typeof hook === 'object' && 'handler' in hook && typeof hook.handler === 'function'
      ? hook.handler
      : undefined
}

/** 完成后的 Promise 可以继续存活，但不能继续捕获宿主钩子的 this。 */
function consumeOnce(operation: () => unknown) {
  let pending: (() => unknown) | undefined = operation
  return () => {
    const invoke = pending
    pending = undefined
    return invoke?.()
  }
}

function materializeErrorStack(error: unknown, seen = new WeakSet<Error>()) {
  if (error instanceof Error && !seen.has(error)) {
    seen.add(error)
    try {
      // V8 延迟栈会保留真实 this；在诊断边界物化文本，仍保留原错误身份。
      void error.stack
    }
    catch {
      // 用户自定义 stack getter 失败不能遮蔽原始清理错误。
    }
    try {
      materializeErrorStack(error.cause, seen)
      if (error instanceof AggregateError) {
        for (const nested of error.errors) {
          materializeErrorStack(nested, seen)
        }
      }
    }
    catch {
      // 用户自定义 cause/errors 访问器同样不能改变原始错误结果。
    }
  }
}

/** 核心关闭必须由宿主最后串行调度，不能提前等待尚未调用的扩展钩子。 */
export function assertPluginShutdownOrder(slots: readonly VitePluginSlot[]) {
  const owners = slots.filter(slot => slot.ownsSession)
  if (owners.length > 1) {
    throw new Error('Vite 编译实例只能登记一个关闭协调者。')
  }
  const owner = owners[0]
  if (!owner || !slots.some(slot => slot !== owner && (slot.hooks.buildEnd || slot.hooks.closeBundle || slot.hooks.closeWatcher))) {
    return
  }
  const rank = { pre: -1, post: 1 }
  const ordered = [...slots].sort((left, right) => (left.enforce ? rank[left.enforce] : 0) - (right.enforce ? rank[right.enforce] : 0))
  for (const hook of ['buildEnd', 'closeBundle', 'closeWatcher'] as const) {
    const metadata = owner.hooks[hook]
    if (metadata && (metadata === true || metadata.order !== 'post' || metadata.sequential !== true)) {
      throw new Error(`Vite 关闭协调者必须使用末尾串行钩子：${owner.name}.${hook}`)
    }
    if (ordered.slice(ordered.indexOf(owner) + 1).some((slot) => {
      const next = slot.hooks[hook]
      return next && typeof next === 'object' && next.order === 'post'
    })) {
      throw new Error(`Vite 关闭协调者之后不能再登记终止钩子：${owner.name}.${hook}`)
    }
  }
}

/** 扩展清理沿各自宿主上下文运行；失败延后到唯一协调者完成核心释放后报告。 */
export function createPluginShutdown(
  slots: readonly VitePluginSlot[],
  plugins: readonly Plugin[],
  invocation: ReturnType<typeof createPluginInvocationSession>,
  config: ResolvedConfig,
  ownership: VitePluginOwnership,
) {
  const coordinated = ownership !== 'standalone'
  if (coordinated) {
    for (const plugin of plugins) {
      claimVitePluginCleanup(plugin)
    }
  }
  const ownerSlot = slots.find(slot => slot.ownsSession)
  const owner = plugins.find(plugin => plugin.name === (ownerSlot?.pluginName ?? ownerSlot?.name))
  const contexts = new Map<Plugin, unknown>()
  const cleanups = new Map<Plugin, Promise<void>>()
  const disabled = new Set<Plugin>()
  const completed = Promise.resolve()
  let released = false
  const failures: unknown[] = []
  const rememberFailure = (error: unknown) => {
    materializeErrorStack(error)
    failures.push(error)
  }
  const cleanup = (plugin: Plugin, invoke: () => unknown) => {
    if (released) {
      return completed
    }
    let task = cleanups.get(plugin)
    if (!task) {
      task = invocation.drain().then(consumeOnce(invoke)).then(() => {}, rememberFailure)
      cleanups.set(plugin, task)
    }
    return task
  }
  const invokeCaptured = async (plugin: Plugin, handler: NonNullable<ReturnType<typeof handlerOf>>) => {
    // 工厂已创建但未收到钩子的插件没有宿主上下文；其资源清理只能依赖自身状态。
    const context = contexts.get(plugin)
    try {
      return await Reflect.apply(handler, context, [])
    }
    catch (error) {
      if (context === undefined) {
        throw new Error(`Vite 插件尚未取得宿主上下文，初始化清理失败：${plugin.name}`, { cause: error })
      }
      throw error
    }
  }
  const cleanupRemaining = async (preferred: ClosingHook) => {
    const children = new Set<NonNullable<ReturnType<typeof getVitePluginCleanup>>>()
    // 初始化失败或不存在对应终止钩子时，只能使用该插件已经取得的宿主上下文。
    for (const plugin of plugins) {
      if (plugin === owner || disabled.has(plugin)) {
        continue
      }
      const child = getVitePluginCleanup(plugin)
      if (child) {
        children.add(child)
        continue
      }
      if (cleanups.has(plugin)) {
        continue
      }
      const handler = handlerOf(plugin[preferred]) ?? handlerOf(plugin[preferred === 'closeWatcher' ? 'closeBundle' : 'closeWatcher'])
      if (handler) {
        await cleanup(plugin, () => invokeCaptured(plugin, handler))
      }
    }
    await Promise.all(cleanups.values())
    for (const child of children) {
      try {
        await child(config, preferred)
      }
      catch (error) {
        rememberFailure(error)
      }
    }
  }
  const finish = (operation: () => unknown, preferred: ClosingHook, initialError?: { error: unknown }) => {
    const invoke = consumeOnce(operation)
    return invocation.close(async () => {
      try {
        await cleanupRemaining(preferred)
        let result: unknown
        try {
          result = await invoke()
        }
        catch (error) {
          rememberFailure(error)
        }
        if (initialError && failures.length === 0) {
          throw initialError.error
        }
        if (failures.length > 0) {
          throw new AggregateError(initialError ? [initialError.error, ...failures] : failures, 'Vite 编译实例初始化或清理失败。')
        }
        return result
      }
      finally {
        released = true
        contexts.clear()
        cleanups.clear()
        disabled.clear()
        failures.length = 0
      }
    })
  }
  const invokeOwner = (preferred: ClosingHook) => {
    const handler = handlerOf(owner?.[preferred]) ?? handlerOf(owner?.[preferred === 'closeWatcher' ? 'closeBundle' : 'closeWatcher'])
    return owner && handler && invokeCaptured(owner, handler)
  }
  return {
    coordinated,
    setEnabled(plugin: Plugin, enabled: boolean) {
      if (coordinated && !released) {
        if (enabled) {
          disabled.delete(plugin)
        }
        else {
          disabled.add(plugin)
        }
      }
    },
    capture(plugin: Plugin, context: unknown) {
      if (!released && context !== undefined) {
        contexts.set(plugin, context)
      }
    },
    cleanup,
    finish,
    close: (preferred: ClosingHook) => finish(() => invokeOwner(preferred), preferred),
    finalBuildEnd: (invoke: () => unknown) => released ? completed : invocation.drain().then(consumeOnce(invoke)).then(() => {}, rememberFailure),
    fail(error: unknown) {
      materializeErrorStack(error)
      if (ownership === 'child') {
        void invocation.drain()
        return Promise.reject(error)
      }
      return finish(() => invokeOwner('closeWatcher'), 'closeWatcher', { error })
    },
  }
}

/** 前置屏障不释放资源；终止钩子继续由宿主按原有顺序和上下文调度。 */
export function createPluginShutdownBarrier(
  ownerName: string,
  begin: (context: unknown, hook: ClosingHook | 'buildEnd', error?: unknown) => void | Promise<void>,
): Plugin {
  return {
    name: `${ownerName}:shutdown-barrier`,
    enforce: 'pre',
    closeWatcher: { order: 'pre', sequential: true, handler() {
      return begin(this, 'closeWatcher')
    } },
    closeBundle: { order: 'pre', sequential: true, handler() {
      return begin(this, 'closeBundle')
    } },
    buildEnd: { order: 'pre', sequential: true, handler(error) {
      return begin(this, 'buildEnd', error)
    } },
  }
}
