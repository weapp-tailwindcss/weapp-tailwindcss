import type { Plugin, ResolvedConfig } from 'vite'
import type { VitePluginSlot } from '@/bundlers/vite/shared/plugin-slots'
import { describe, expect, it } from 'vitest'
import { claimVitePluginCleanup, getVitePluginCleanup } from '@/bundlers/vite/shared/plugin-cleanup-bridge'
import { createDeferredVitePlugins } from '@/bundlers/vite/shared/plugin-slots'

function call(plugin: Plugin, name: keyof Plugin, context: unknown, ...args: unknown[]) {
  const hook = plugin[name]
  const handler = typeof hook === 'function' ? hook : hook && typeof hook === 'object' && 'handler' in hook ? hook.handler : undefined
  return typeof handler === 'function' ? Reflect.apply(handler, context, args) : undefined
}

const childSlots = [
  { name: 'first', hooks: { configResolved: true, closeWatcher: true } },
  { name: 'second', hooks: { configResolved: true, closeWatcher: true } },
  { name: 'third', hooks: { configResolved: true, closeWatcher: true } },
] satisfies VitePluginSlot[]
const ownerSlot = {
  name: 'owner',
  ownsSession: true,
  hooks: { transform: true, closeWatcher: { order: 'post', sequential: true } },
} satisfies VitePluginSlot

describe('嵌套代理只由父级协调永久关闭', () => {
  it('内层绑定失败仍清理未绑定的真实扩展，再关闭核心', async () => {
    const events: string[] = []
    const plugins = createDeferredVitePlugins([...childSlots, ownerSlot], () => [
      ...createDeferredVitePlugins(childSlots, () => [
        { name: 'first', closeWatcher() {
          expect(this).toBeUndefined()
          events.push('first')
        } },
        { name: 'second', closeWatcher: { order: 'pre', handler() {
          expect(this).toBeUndefined()
          events.push('second')
        } } },
        { name: 'third', closeWatcher() {
          expect(this).toBeUndefined()
          events.push('third')
        } },
      ]),
      { name: 'owner', closeWatcher: { order: 'post', sequential: true, handler() {
        events.push('core')
      } } },
    ])
    const resolved = { command: 'build', build: { watch: {} } } as ResolvedConfig
    await expect(call(plugins[0]!, 'configResolved', {}, resolved)).rejects.toThrow('钩子与声明不一致：second.closeWatcher')
    expect(events).toEqual(['first', 'second', 'third', 'core'])
    const closing = call(plugins[3]!, 'closeWatcher', {})
    expect(call(plugins[3]!, 'closeWatcher', {})).toBe(closing)
    await expect(closing).rejects.toThrow('钩子与声明不一致')
    expect(events).toEqual(['first', 'second', 'third', 'core'])
  })

  it('内层部分初始化失败先排空父级任务，保留已捕获this并释放未初始化扩展', async () => {
    const events: string[] = []
    const gate = Promise.withResolvers<void>()
    const failure = new Error('inner configuration failed')
    const firstContext = {}
    const secondContext = {}
    const plugins = createDeferredVitePlugins([...childSlots, ownerSlot], () => [
      ...createDeferredVitePlugins(childSlots, () => [
        { name: 'first', configResolved() {}, closeWatcher() {
          expect(this).toBe(firstContext)
          events.push('first')
        } },
        { name: 'second', configResolved() {
          throw failure
        }, closeWatcher() {
          expect(this).toBe(secondContext)
          events.push('second')
        } },
        { name: 'third', configResolved() {
          throw new Error('unreachable')
        }, closeWatcher() {
          expect(this).toBeUndefined()
          events.push('third')
        } },
      ]),
      {
        name: 'owner',
        async transform() {
          await gate.promise
          events.push('task')
        },
        closeWatcher: { order: 'post', sequential: true, handler() {
          events.push('core')
        } },
      },
    ])
    const resolved = { command: 'build', build: { watch: {} } } as ResolvedConfig
    await call(plugins[0]!, 'configResolved', firstContext, resolved)
    const task = call(plugins[3]!, 'transform', {}, '', 'source.js')
    const initialization = expect(call(plugins[1]!, 'configResolved', secondContext, resolved)).rejects.toBe(failure)
    await Promise.resolve()
    expect(events).toEqual([])
    gate.resolve()
    await task
    await initialization
    expect(events).toEqual(['task', 'first', 'second', 'third', 'core'])
  })

  it('正常宿主终止钩子与父级收尾桥共享幂等清理结果', async () => {
    const contexts = new Map([['first', {}], ['second', {}], ['third', {}], ['owner', {}]])
    const events: string[] = []
    const plugins = createDeferredVitePlugins([...childSlots, ownerSlot], () => [
      ...createDeferredVitePlugins(childSlots, () => childSlots.map(slot => ({
        name: slot.name,
        closeWatcher() {
          expect(this).toBe(contexts.get(slot.name))
          events.push(slot.name)
        },
      }))),
      { name: 'owner', closeWatcher: { order: 'post', sequential: true, handler() {
        events.push('core')
      } } },
    ])
    const resolved = { command: 'build', build: { watch: {} } } as ResolvedConfig
    for (const plugin of plugins) {
      await call(plugin, 'configResolved', contexts.get(plugin.name), resolved)
    }
    for (const plugin of plugins) {
      await call(plugin, 'closeWatcher', contexts.get(plugin.name))
    }
    for (const plugin of plugins) {
      await call(plugin, 'closeWatcher', contexts.get(plugin.name))
    }
    expect(events).toEqual(['first', 'second', 'third', 'core'])
  })

  it('内嵌组拥有自身核心时，父级失败收尾也调用其关闭所有者', async () => {
    const failure = new Error('nested failed')
    const events: string[] = []
    const innerOwner = { ...ownerSlot, name: 'inner-owner' }
    const slots = [childSlots[0], innerOwner]
    const plugins = createDeferredVitePlugins(slots, () => [
      { name: 'first', configResolved() {
        throw failure
      }, closeWatcher() {
        events.push('extension')
      } },
      { name: 'inner-owner', closeWatcher: { order: 'post', sequential: true, handler() {
        events.push('inner-core')
      } } },
    ])
    claimVitePluginCleanup(plugins[0]!)
    const resolved = { command: 'build', build: { watch: {} } } as ResolvedConfig
    await expect(call(plugins[0]!, 'configResolved', {}, resolved)).rejects.toBe(failure)
    expect(events).toEqual([])
    await getVitePluginCleanup(plugins[0]!)!(resolved, 'closeWatcher')
    expect(events).toEqual(['extension', 'inner-core'])
  })

  it('独立无所有者代理保持返回值与错误转发，不截获外层并不存在的关闭职责', async () => {
    const failure = new Error('standalone close failed')
    const context = {}
    const [plugin] = createDeferredVitePlugins([
      { name: 'standalone', hooks: { transform: true, closeBundle: true } },
    ], () => [{
      name: 'standalone',
      transform(code) {
        expect(this).toBe(context)
        return code
      },
      closeBundle() {
        expect(this).toBe(context)
        throw failure
      },
    }])
    const resolved = { command: 'build', build: {} } as ResolvedConfig
    await call(plugin!, 'configResolved', context, resolved)
    expect(() => call(plugin!, 'closeBundle', context)).toThrow(failure)
    expect(call(plugin!, 'transform', context, 'delegated', 'source.js')).toBe('delegated')
  })

  it.each(['throws', 'disabled'])('runtime apply 为 %s 时遵循初始化失败及禁用钩子边界', async (mode) => {
    const failure = new Error('apply failed')
    const events: string[] = []
    const plugins = createDeferredVitePlugins([
      { name: 'extension', runtimeApply: true, hooks: { configResolved: true, closeWatcher: true } },
      ownerSlot,
    ], () => [
      {
        name: 'extension',
        apply() {
          if (mode === 'throws') {
            throw failure
          }
          return false
        },
        configResolved() {
          events.push('configuration')
        },
        closeWatcher() {
          events.push('extension')
        },
      },
      { name: 'owner', closeWatcher: { order: 'post', sequential: true, handler() {
        events.push('core')
      } } },
    ])
    const resolved = { command: 'build', build: { watch: {} } } as ResolvedConfig
    if (mode === 'throws') {
      await expect(call(plugins[0]!, 'configResolved', {}, resolved)).rejects.toBe(failure)
      expect(events).toEqual(['extension', 'core'])
    }
    else {
      await call(plugins[0]!, 'configResolved', {}, resolved)
      await call(plugins[1]!, 'closeWatcher', {})
      expect(events).toEqual(['core'])
    }
  })
})
