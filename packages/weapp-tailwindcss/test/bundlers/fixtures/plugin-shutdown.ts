import type { Plugin, ResolvedConfig } from 'vite'
import type { VitePluginSlot } from '@/bundlers/vite/shared/plugin-slots'

type ShutdownHook = 'closeWatcher' | 'closeBundle' | 'buildEnd'

export function call(plugin: Plugin, name: keyof Plugin, context: unknown, ...args: unknown[]) {
  const hook = plugin[name]
  const handler = typeof hook === 'function' ? hook : hook && typeof hook === 'object' && 'handler' in hook ? hook.handler : undefined
  return typeof handler === 'function' ? Reflect.apply(handler, context, args) : undefined
}

/** 按 Rollup 的顺序与 sequential 屏障调度，避免用并发 Promise.all 掩盖死锁。 */
export async function terminate(plugins: Plugin[], hook: ShutdownHook, contexts: Map<string, object>, ...args: unknown[]) {
  const rank = { pre: -1, post: 1 }
  const ordered = plugins.filter(plugin => plugin[hook]).toSorted((left, right) => {
    const first = left[hook]
    const second = right[hook]
    const a = typeof first === 'object' && first.order ? rank[first.order] : 0
    const b = typeof second === 'object' && second.order ? rank[second.order] : 0
    return a - b
  })
  let pending: Promise<unknown>[] = []
  for (const plugin of ordered) {
    const candidate = plugin[hook]
    const sequential = typeof candidate === 'object' && candidate.sequential
    if (sequential) {
      await Promise.all(pending)
      pending = []
    }
    const task = Promise.resolve(call(plugin, hook, contexts.get(plugin.name), ...args))
    if (sequential) {
      await task
    }
    else {
      pending.push(task)
    }
  }
  await Promise.all(pending)
}

export const ownerSlot = {
  name: 'owner',
  ownsSession: true,
  hooks: {
    buildEnd: { order: 'post', sequential: true },
    closeBundle: { order: 'post', sequential: true },
    closeWatcher: { order: 'post', sequential: true },
  },
} satisfies VitePluginSlot

export function config(watch = true) {
  return { command: 'build', build: { watch: watch ? {} : null } } as ResolvedConfig
}
