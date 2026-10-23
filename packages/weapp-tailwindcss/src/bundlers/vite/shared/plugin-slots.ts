import type { Plugin, ResolvedConfig } from 'vite'
import { createPluginInvocationSession } from './plugin-invocation-session'

/** 只列出 Vite/Rollup 的钩子；插件数据字段不作为可执行钩子代理。 */
export const vitePluginHookNames = [
  'config',
  'configResolved',
  'configEnvironment',
  'configureServer',
  'configurePreviewServer',
  'buildStart',
  'buildEnd',
  'resolveId',
  'resolveDynamicImport',
  'load',
  'transform',
  'moduleParsed',
  'shouldTransformCachedModule',
  'watchChange',
  'closeWatcher',
  'outputOptions',
  'renderStart',
  'banner',
  'footer',
  'intro',
  'outro',
  'renderChunk',
  'augmentChunkHash',
  'renderError',
  'generateBundle',
  'writeBundle',
  'closeBundle',
  'handleHotUpdate',
  'hotUpdate',
  'transformIndexHtml',
] as const satisfies readonly (keyof Plugin)[]

type HookName = (typeof vitePluginHookNames)[number]
type HookMetadata<K extends HookName> = Omit<Extract<NonNullable<Plugin[K]>, { handler: unknown }>, 'handler'>
export type PluginSlotHooks = { readonly [K in HookName]?: true | HookMetadata<K> }

/** 静态槽位不创建运行时；元数据在 Vite 收集插件时就固定。 */
export interface VitePluginSlot {
  readonly name: string
  readonly pluginName?: string
  readonly enforce?: Plugin['enforce']
  readonly apply?: 'serve' | 'build'
  readonly runtimeApply?: boolean
  readonly ownsSession?: boolean
  readonly hooks: PluginSlotHooks
  /** 组装端明确登记对公开工厂的排序覆盖。 */
  readonly overrideEnforce?: boolean
  readonly overrideApply?: boolean
}

function handlerOf(hook: unknown) {
  return typeof hook === 'function'
    ? hook
    : hook && typeof hook === 'object' && 'handler' in hook && typeof hook.handler === 'function'
      ? hook.handler
      : undefined
}

function metadataOf(hook: unknown): Record<string, unknown> {
  if (!hook || typeof hook !== 'object') {
    return {}
  }
  return Object.fromEntries(Object.entries(hook).filter(([key]) => key !== 'handler'))
}

function sameMetadata(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true
  }
  if (left instanceof RegExp && right instanceof RegExp) {
    return left.source === right.source && left.flags === right.flags
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => sameMetadata(value, right[index]))
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
    return false
  }
  const entries = Object.entries(left)
  return entries.length === Object.keys(right).length
    && entries.every(([key, value]) => Object.hasOwn(right, key) && sameMetadata(value, Reflect.get(right, key)))
}

/** 校验实际工厂不能悄悄增加钩子或更改 Vite 的排序与过滤语义。 */
export function bindVitePluginSlots(slots: readonly VitePluginSlot[], plugins: readonly Plugin[]) {
  const bindings = new Map<string, Plugin>()
  for (const plugin of plugins) {
    const slot = slots.find(candidate => (candidate.pluginName ?? candidate.name) === plugin.name)
    if (!slot || bindings.has(slot.name)) {
      throw new Error(`未声明或重复的 Vite 插件：${plugin.name}`)
    }
    if ((!slot.overrideEnforce && slot.enforce !== plugin.enforce)
      || (!slot.runtimeApply && !slot.overrideApply && slot.apply !== plugin.apply)) {
      throw new Error(`Vite 插件元数据与声明不一致：${plugin.name}`)
    }
    for (const [key, value] of Object.entries(plugin)) {
      if (key !== 'apply' && key !== 'api' && handlerOf(value) && !vitePluginHookNames.includes(key as HookName)) {
        throw new Error(`未声明的 Vite 钩子：${plugin.name}.${key}`)
      }
    }
    for (const key of vitePluginHookNames) {
      const hook = plugin[key]
      if (!handlerOf(hook)) {
        continue
      }
      const expected = slot.hooks[key]
      if (expected === undefined || !sameMetadata(expected === true ? {} : expected, metadataOf(hook))) {
        throw new Error(`Vite 插件钩子与声明不一致：${plugin.name}.${key}`)
      }
    }
    bindings.set(slot.name, plugin)
  }
  return bindings
}

interface PluginSlotState {
  config: ResolvedConfig
  bindings: Map<string, Plugin>
  invocation: ReturnType<typeof createPluginInvocationSession>
}

/** 多个候选分支共享槽位时只合并兼容的钩子声明。 */
export function mergeVitePluginSlots(groups: readonly (readonly VitePluginSlot[])[]): VitePluginSlot[] {
  const merged = new Map<string, VitePluginSlot>()
  for (const slot of groups.flat()) {
    const previous = merged.get(slot.name)
    if (!previous) {
      merged.set(slot.name, slot)
      continue
    }
    if (previous.apply !== slot.apply || previous.enforce !== slot.enforce) {
      throw new Error(`Vite 槽位排序冲突：${slot.name}`)
    }
    for (const key of vitePluginHookNames) {
      if (previous.hooks[key] !== undefined && slot.hooks[key] !== undefined
        && !sameMetadata(previous.hooks[key], slot.hooks[key])) {
        throw new Error(`Vite 槽位钩子冲突：${slot.name}.${key}`)
      }
    }
    merged.set(slot.name, { ...previous, hooks: { ...previous.hooks, ...slot.hooks } })
  }
  const predecessors = new Map([...merged.keys()].map(name => [name, new Set<string>()]))
  for (const group of groups) {
    for (let index = 1; index < group.length; index++) {
      predecessors.get(group[index]!.name)!.add(group[index - 1]!.name)
    }
  }
  const ordered: VitePluginSlot[] = []
  while (predecessors.size > 0) {
    const next = [...predecessors].find(([, before]) => before.size === 0)?.[0]
    if (!next) {
      throw new Error('Vite 插件声明存在循环排序约束。')
    }
    ordered.push(merged.get(next)!)
    predecessors.delete(next)
    for (const before of predecessors.values()) {
      before.delete(next)
    }
  }
  return ordered
}

/** 每个 resolved config 只初始化一次；逐插件保留返回值、this 和钩子元数据。 */
export function createDeferredVitePlugins(
  slots: readonly VitePluginSlot[],
  create: (config: ResolvedConfig, context: unknown) => readonly Plugin[],
): Plugin[] {
  const states = new WeakMap<ResolvedConfig, PluginSlotState>()
  const contexts = new WeakMap<object, PluginSlotState>()
  let active: PluginSlotState | undefined
  const resolveState = (context: unknown, config?: ResolvedConfig) => {
    const environmentConfig = (context as { environment?: { config?: ResolvedConfig } } | undefined)?.environment?.config
    const selectedConfig = config ?? environmentConfig
    if (selectedConfig) {
      let state = states.get(selectedConfig)
      if (!state && config) {
        state = { config, bindings: bindVitePluginSlots(slots, create(config, context)), invocation: createPluginInvocationSession() }
        states.set(config, state)
      }
      if (state) {
        active = state
        if (context && typeof context === 'object') {
          contexts.set(context, state)
        }
        return state
      }
    }
    return context && typeof context === 'object' ? contexts.get(context) ?? active : active
  }
  return slots.map((slot) => {
    const plugin: Plugin = {
      name: slot.name,
      ...(slot.enforce === undefined ? {} : { enforce: slot.enforce }),
      ...(slot.apply === undefined ? {} : { apply: slot.apply }),
    }
    Object.defineProperty(plugin, 'api', { get: () => active?.bindings.get(slot.name)?.api })
    const hooks = { configResolved: true, ...slot.hooks } satisfies PluginSlotHooks
    for (const [key, metadata] of Object.entries(hooks)) {
      const hookName = key as HookName
      const handler = function (this: unknown, ...args: unknown[]) {
        const state = resolveState(this, hookName === 'configResolved' ? args[0] as ResolvedConfig : undefined)
        const delegate = state?.bindings.get(slot.name)
        if (!delegate || !state) {
          return
        }
        if (slot.runtimeApply && delegate.apply) {
          const enabled = typeof delegate.apply === 'function'
            ? Reflect.apply(delegate.apply, delegate, [state.config, { command: state.config.command, mode: state.config.mode }])
            : delegate.apply === state.config.command
          if (!enabled) {
            return
          }
        }
        const run = handlerOf(delegate[hookName])
        if (!run) {
          return
        }
        const invoke = () => Reflect.apply(run, this, args)
        const persistent = state.config.command === 'serve' || state.config.build?.watch != null
        const closesSession = slot.ownsSession && (hookName === 'closeWatcher'
          || (!persistent && (hookName === 'closeBundle' || (hookName === 'buildEnd' && args[0]))))
        if (closesSession) {
          return state.invocation.close(invoke)
        }
        // 结束钩子允许重复调用，由唯一关闭协调者保证幂等。
        if (hookName === 'closeBundle' || hookName === 'closeWatcher' || hookName === 'buildEnd') {
          return invoke()
        }
        const result = state.invocation.run(invoke)
        if (hookName === 'configResolved' && result && typeof result === 'object' && 'then' in result && typeof result.then === 'function') {
          return Promise.resolve(result).catch(async (error) => {
            const coordinator = slots.find(candidate => candidate.ownsSession)
            const cleanup = coordinator && handlerOf(state.bindings.get(coordinator.name)?.closeWatcher)
            try {
              await state.invocation.close(() => cleanup && Reflect.apply(cleanup, this, []))
            }
            catch (cleanupError) {
              throw new AggregateError([error, cleanupError], 'Vite 初始化与清理均失败。')
            }
            throw error
          })
        }
        return result
      }
      Object.assign(plugin, { [key]: metadata === true ? handler : { ...metadata, handler } })
    }
    return plugin
  })
}
