import type { ResolvedConfig } from 'vite'
import type { VitePluginSlot } from '@/bundlers/vite/shared/plugin-slots'
import { describe, expect, it } from 'vitest'
import { createFrameworkRuntimeLifecycle } from '@/bundlers/vite/shared/framework-runtime-lifecycle'
import { runtimeLifecycleSlot } from '@/bundlers/vite/shared/plugin-descriptors'
import { bindVitePluginSlots, createDeferredVitePlugins } from '@/bundlers/vite/shared/plugin-slots'

import { call, config, ownerSlot, terminate } from './fixtures/plugin-shutdown'

describe('跨插件关闭所有权与宿主调度', () => {
  it.each([false, true])('排空活动任务，再按真实 this 关闭扩展与核心，扩展 sequential=%s', async (sequential) => {
    const release = Promise.withResolvers<void>()
    const events: string[] = []
    const contexts = new Map([['extension', {}], ['owner', {}]])
    const plugins = createDeferredVitePlugins([
      { name: 'extension', hooks: { transform: true, closeWatcher: { order: 'pre', sequential } } },
      ownerSlot,
    ], () => [
      {
        name: 'extension',
        async transform() {
          await release.promise
          events.push('task')
        },
        closeWatcher: {
          order: 'pre',
          sequential,
          handler() {
            expect(this).toBe(contexts.get('extension'))
            events.push('extension')
          },
        },
      },
      { name: 'owner', closeWatcher: { order: 'post', sequential: true, handler() {
        expect(this).toBe(contexts.get('owner'))
        events.push('core')
      } } },
    ])
    const resolved = config()
    for (const plugin of plugins) {
      await call(plugin, 'configResolved', contexts.get(plugin.name), resolved)
    }
    const task = call(plugins[0]!, 'transform', contexts.get('extension'), '', 'source.js')
    const closing = terminate(plugins, 'closeWatcher', contexts)
    await Promise.resolve()
    expect(events).toEqual([])
    release.resolve()
    await task
    await closing
    expect(events).toEqual(['task', 'extension', 'core'])
    const closed = call(plugins[1]!, 'closeWatcher', contexts.get('owner'))
    expect(call(plugins[1]!, 'closeWatcher', contexts.get('owner'))).toBe(closed)
    await closed
    expect(events).toEqual(['task', 'extension', 'core'])
  })

  it('扩展清理失败仍关闭剩余扩展与核心，最后报告原始错误', async () => {
    const failure = new Error('extension cleanup failed')
    const events: string[] = []
    const plugins = createDeferredVitePlugins([
      { name: 'first', hooks: { closeWatcher: { sequential: true } } },
      { name: 'second', hooks: { closeWatcher: true } },
      ownerSlot,
    ], () => [
      { name: 'first', closeWatcher: { sequential: true, handler() {
        events.push('first')
        throw failure
      } } },
      { name: 'second', closeWatcher() {
        events.push('second')
      } },
      { name: 'owner', closeWatcher: { order: 'post', sequential: true, handler() {
        events.push('core')
      } } },
    ])
    const resolved = config()
    for (const plugin of plugins) {
      await call(plugin, 'configResolved', {}, resolved)
    }
    await expect(terminate(plugins, 'closeWatcher', new Map())).rejects.toMatchObject({ errors: [failure] })
    expect(events).toEqual(['first', 'second', 'core'])
  })

  it('配置初始化失败用已捕获的逐插件上下文收尾，并合并清理错误', async () => {
    const failure = new Error('configuration failed')
    const cleanupFailure = new Error('cleanup failed')
    const events: string[] = []
    const firstContext = {}
    const plugins = createDeferredVitePlugins([
      { name: 'first', hooks: { configResolved: true, closeWatcher: true } },
      { name: 'second', hooks: { configResolved: true, closeWatcher: true } },
      { name: 'uninitialized', hooks: { configResolved: true, closeWatcher: true } },
      ownerSlot,
    ], () => [
      { name: 'first', configResolved() {}, closeWatcher() {
        expect(this).toBe(firstContext)
        events.push('first')
        throw cleanupFailure
      } },
      { name: 'second', configResolved() {
        throw failure
      }, closeWatcher() {
        events.push('second')
      } },
      { name: 'uninitialized', configResolved() {
        throw new Error('unreachable')
      }, closeWatcher() {
        expect(this).toBeUndefined()
        events.push('uninitialized')
      } },
      { name: 'owner', closeWatcher: { order: 'post', sequential: true, handler() {
        events.push('core')
      } } },
    ])
    const resolved = config()
    await call(plugins[0]!, 'configResolved', firstContext, resolved)
    await expect(call(plugins[1]!, 'configResolved', {}, resolved)).rejects.toMatchObject({ errors: [failure, cleanupFailure] })
    expect(events).toEqual(['first', 'second', 'uninitialized', 'core'])
    await expect(call(plugins[1]!, 'configResolved', {}, resolved)).rejects.toThrow('不再接收')
  })

  it('未取得宿主上下文的清理失败有明确诊断，且仍释放核心', async () => {
    const failure = new Error('initialization failed')
    const cleanupFailure = new Error('context required')
    let closed = false
    const plugins = createDeferredVitePlugins([
      { name: 'initialize', hooks: { configResolved: true } },
      { name: 'uninitialized', hooks: { closeWatcher: true } },
      ownerSlot,
    ], () => [
      { name: 'initialize', configResolved() {
        throw failure
      } },
      { name: 'uninitialized', closeWatcher() {
        expect(this).toBeUndefined()
        throw cleanupFailure
      } },
      { name: 'owner', closeWatcher: { order: 'post', sequential: true, handler() {
        closed = true
      } } },
    ])
    await expect(call(plugins[0]!, 'configResolved', {}, config())).rejects.toMatchObject({
      errors: [failure, { message: 'Vite 插件尚未取得宿主上下文，初始化清理失败：uninitialized', cause: cleanupFailure }],
    })
    expect(closed).toBe(true)
  })

  it('非 watch 致命 buildEnd 先结束扩展并清理，再释放核心，重复关闭不重跑', async () => {
    const events: string[] = []
    const cleanupFailure = new Error('extension cleanup failed')
    const plugins = createDeferredVitePlugins([
      { name: 'extension', hooks: { buildEnd: { order: 'post' }, closeBundle: true, transform: true } },
      runtimeLifecycleSlot,
    ], () => [
      { name: 'extension', transform() {}, buildEnd: { order: 'post', handler() {
        events.push('end')
      } }, closeBundle() {
        events.push('extension')
        throw cleanupFailure
      } },
      createFrameworkRuntimeLifecycle({ getResolvedConfig: () => config(false), dispose: async () => {
        events.push('core')
      } }),
    ])
    const resolved = config(false)
    for (const plugin of plugins) {
      await call(plugin, 'configResolved', {}, resolved)
    }
    await expect(terminate(plugins, 'buildEnd', new Map(), new Error('fatal build'))).rejects.toMatchObject({ errors: [cleanupFailure] })
    expect(events).toEqual(['end', 'extension', 'core'])
    expect(() => call(plugins[0]!, 'transform', {}, '', 'file.js')).toThrow('不再接收')
    await expect(terminate(plugins, 'closeBundle', new Map())).rejects.toMatchObject({ errors: [cleanupFailure] })
    expect(events).toEqual(['end', 'extension', 'core'])
  })

  it('watch 可恢复失败和轮次 closeBundle 后仍接收下一次转换', async () => {
    const events: string[] = []
    const resolved = config(true)
    const plugins = createDeferredVitePlugins([
      { name: 'extension', hooks: { buildEnd: true, closeBundle: true, transform: true } },
      runtimeLifecycleSlot,
    ], () => [
      { name: 'extension', transform(code) {
        return code
      }, buildEnd() {
        events.push('end')
      }, closeBundle() {
        events.push('round')
      } },
      createFrameworkRuntimeLifecycle({ getResolvedConfig: () => resolved, dispose: async () => {
        events.push('core')
      } }),
    ])
    for (const plugin of plugins) {
      await call(plugin, 'configResolved', {}, resolved)
    }
    await terminate(plugins, 'buildEnd', new Map(), new Error('recoverable'))
    await terminate(plugins, 'closeBundle', new Map())
    expect(call(plugins[0]!, 'transform', {}, 'next round', 'file.js')).toBe('next round')
    expect(events).toEqual(['end', 'round'])
    await terminate(plugins, 'closeWatcher', new Map())
    expect(events).toEqual(['end', 'round', 'round', 'core'])
  })

  it('仅有 buildEnd 的扩展也要求协调者位于末尾，且声明匹配真实元数据', () => {
    const extension = { name: 'extension', hooks: { buildEnd: { order: 'post' } } } satisfies VitePluginSlot
    expect(() => createDeferredVitePlugins([ownerSlot, extension], () => [])).toThrow('之后不能再登记')
    expect(() => createDeferredVitePlugins([extension, { ...ownerSlot, hooks: { buildEnd: true } }], () => [])).toThrow('末尾串行')
    expect(() => createDeferredVitePlugins([{ ...extension, enforce: 'post' }, ownerSlot], () => [])).toThrow('之后不能再登记')
    const lifecycle = createFrameworkRuntimeLifecycle({ getResolvedConfig: () => config(), dispose: async () => {} })
    expect(() => bindVitePluginSlots([runtimeLifecycleSlot], [lifecycle])).not.toThrow()
    expect(() => bindVitePluginSlots([{ ...runtimeLifecycleSlot, hooks: { ...runtimeLifecycleSlot.hooks, buildEnd: true } }], [lifecycle])).toThrow('钩子与声明不一致')
  })

  it('serve 的 closeBundle 屏障在宿主调度扩展前排空任务', async () => {
    const gate = Promise.withResolvers<void>()
    const events: string[] = []
    const resolved = { command: 'serve', build: {} } as ResolvedConfig
    const plugins = createDeferredVitePlugins([
      { name: 'extension', hooks: { transform: true, closeBundle: true } },
      runtimeLifecycleSlot,
    ], () => [
      { name: 'extension', async transform() {
        await gate.promise
        events.push('task')
      }, closeBundle() {
        events.push('extension')
      } },
      createFrameworkRuntimeLifecycle({ getResolvedConfig: () => resolved, dispose: async () => {
        events.push('core')
      } }),
    ])
    for (const plugin of plugins) {
      await call(plugin, 'configResolved', {}, resolved)
    }
    const task = call(plugins[0]!, 'transform', {}, '', 'source.js')
    const closing = terminate(plugins, 'closeBundle', new Map())
    await Promise.resolve()
    expect(events).toEqual([])
    gate.resolve()
    await task
    await closing
    expect(events).toEqual(['task', 'extension', 'core'])
  })

  it('诊断物化失败不会替换原始清理错误或阻断核心释放', async () => {
    const failure = new Error('cleanup failed')
    Object.defineProperty(failure, 'stack', { get() {
      throw new Error('custom stack getter failed')
    } })
    let closed = false
    const plugins = createDeferredVitePlugins([
      { name: 'extension', hooks: { closeWatcher: true } },
      ownerSlot,
    ], () => [
      { name: 'extension', closeWatcher() {
        throw failure
      } },
      { name: 'owner', closeWatcher: { order: 'post', sequential: true, handler() {
        closed = true
      } } },
    ])
    const resolved = config()
    for (const plugin of plugins) {
      await call(plugin, 'configResolved', {}, resolved)
    }
    const error = await terminate(plugins, 'closeWatcher', new Map()).catch(error => error as AggregateError)
    expect(error).toBeInstanceOf(AggregateError)
    expect(error.errors[0]).toBe(failure)
    expect(closed).toBe(true)
  })

  it('原始聚合错误及 cause 保持身份，不因诊断展开而丢失结构', async () => {
    const cause = new Error('underlying failure')
    const failure = new AggregateError([new Error('nested failure')], 'extension aggregate', { cause })
    let closed = false
    const plugins = createDeferredVitePlugins([
      { name: 'extension', hooks: { closeWatcher: true } },
      ownerSlot,
    ], () => [
      { name: 'extension', closeWatcher() {
        throw failure
      } },
      { name: 'owner', closeWatcher: { order: 'post', sequential: true, handler() {
        closed = true
      } } },
    ])
    const resolved = config()
    for (const plugin of plugins) {
      await call(plugin, 'configResolved', {}, resolved)
    }
    const error = await terminate(plugins, 'closeWatcher', new Map()).catch(error => error as AggregateError)
    expect(error.errors[0]).toBe(failure)
    expect(error.errors[0].cause).toBe(cause)
    expect(closed).toBe(true)
  })
})
