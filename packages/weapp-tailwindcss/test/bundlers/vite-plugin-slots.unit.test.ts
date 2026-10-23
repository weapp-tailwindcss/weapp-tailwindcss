import type { Plugin, ResolvedConfig } from 'vite'
import type { VitePluginSlot } from '@/bundlers/vite/shared/plugin-slots'
import { describe, expect, it, vi } from 'vitest'
import { createFrameworkRuntimeLifecycle, disposeViteResources } from '@/bundlers/vite/shared/framework-runtime-lifecycle'
import { bindVitePluginSlots, createDeferredVitePlugins, mergeVitePluginSlots } from '@/bundlers/vite/shared/plugin-slots'

function call(plugin: Plugin, name: keyof Plugin, context: unknown, ...args: unknown[]) {
  const hook = plugin[name] as any
  return (typeof hook === 'function' ? hook : hook?.handler)?.apply(context, args)
}

function config(watch = false) {
  return { command: 'build', build: { watch: watch ? {} : null } } as ResolvedConfig
}

describe('静态插件契约与逐配置实例', () => {
  it('配置解析前不实例化，并保留每轮调用、上下文、sourcemap 和异常', async () => {
    const map = { version: 3, sources: ['input.css'], names: [], mappings: 'AAAA' }
    const calls: unknown[] = []
    const factory = vi.fn((): Plugin[] => [{
      name: 'fixture',
      buildStart() { calls.push(this) },
      transform: { order: 'pre', handler(code) { if (code === 'fail') throw new Error('fixture failure'); return { code, map } } },
    }])
    const slots = [{ name: 'fixture', hooks: { buildStart: true, transform: { order: 'pre' } } }] satisfies VitePluginSlot[]
    const [plugin] = createDeferredVitePlugins(slots, factory)
    expect(factory).not.toHaveBeenCalled()
    const first = config()
    await call(plugin!, 'configResolved', {}, first)
    const firstContext = { environment: { config: first } }
    await call(plugin!, 'buildStart', firstContext)
    await call(plugin!, 'buildStart', firstContext)
    expect(calls).toEqual([firstContext, firstContext])
    expect(call(plugin!, 'transform', firstContext, 'css', 'input.css')).toEqual({ code: 'css', map })
    expect(() => call(plugin!, 'transform', firstContext, 'fail', 'input.css')).toThrow('fixture failure')
    await call(plugin!, 'configResolved', {}, first)
    expect(factory).toHaveBeenCalledTimes(1)
    await call(plugin!, 'configResolved', {}, config())
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('初始化失败排空任务并关闭核心，不会隐式重建', async () => {
    const failure = new Error('initialization failed')
    const dispose = vi.fn(async () => {})
    const create = vi.fn((): Plugin[] => [
      { name: 'initialize', configResolved: async () => { throw failure } },
      { name: 'close', closeWatcher: dispose },
    ])
    const plugins = createDeferredVitePlugins([
      { name: 'initialize', hooks: { configResolved: true } },
      { name: 'close', ownsSession: true, hooks: { closeWatcher: true } },
    ], create)
    const resolved = config()
    await expect(call(plugins[0]!, 'configResolved', {}, resolved)).rejects.toBe(failure)
    expect(dispose).toHaveBeenCalledTimes(1)
    await expect(call(plugins[0]!, 'configResolved', {}, resolved)).rejects.toThrow('不再接收')
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('工厂与静态声明不一致时仍释放刚创建的实例', async () => {
    const dispose = vi.fn(async () => {})
    const create = vi.fn((): Plugin[] => [{ name: 'unexpected' }, { name: 'close', closeWatcher: dispose }])
    const [plugin] = createDeferredVitePlugins([{ name: 'close', ownsSession: true, hooks: { closeWatcher: true } }], create)
    const resolved = config()
    await expect(call(plugin!, 'configResolved', {}, resolved)).rejects.toThrow('未声明或重复')
    await expect(call(plugin!, 'configResolved', {}, resolved)).rejects.toThrow('未声明或重复')
    expect(dispose).toHaveBeenCalledTimes(1)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('未知插件、未声明钩子及 hook 元数据漂移明确失败', () => {
    const slots = [{ name: 'fixture', hooks: { transform: { order: 'pre' } } }] satisfies VitePluginSlot[]
    expect(() => bindVitePluginSlots(slots, [{ name: 'unknown' }])).toThrow('未声明或重复')
    expect(() => bindVitePluginSlots(slots, [{ name: 'fixture', transform() {} }])).toThrow('钩子与声明不一致')
    expect(() => bindVitePluginSlots(slots, [{ name: 'fixture', futureHook() {} } as Plugin])).toThrow('未声明的 Vite 钩子')
    expect(() => bindVitePluginSlots(slots, [{ name: 'fixture', load() {} }])).toThrow('钩子与声明不一致')
  })

  it('合并静态分支时保留各分支的顺序约束', () => {
    const slot = (name: string): VitePluginSlot => ({ name, hooks: {} })
    expect(mergeVitePluginSlots([[slot('source'), slot('runtime')], [slot('pre'), slot('source'), slot('extra'), slot('runtime')]]).map(entry => entry.name))
      .toEqual(['pre', 'source', 'extra', 'runtime'])
    expect(() => mergeVitePluginSlots([[slot('a'), slot('b')], [slot('b'), slot('a')]])).toThrow('循环排序')
  })

  it('关闭先排空任务，拒绝新任务并返回同一个关闭结果', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    const dispose = vi.fn(async () => {})
    const slots = [{ name: 'fixture', ownsSession: true, hooks: { transform: true, closeWatcher: true } }] satisfies VitePluginSlot[]
    const [plugin] = createDeferredVitePlugins(slots, () => [{ name: 'fixture', transform: () => pending, closeWatcher: dispose }])
    await call(plugin!, 'configResolved', {}, config(true))
    const task = call(plugin!, 'transform', {}, '', 'input.css')
    const firstClose = call(plugin!, 'closeWatcher', {})
    expect(call(plugin!, 'closeWatcher', {})).toBe(firstClose)
    expect(dispose).not.toHaveBeenCalled()
    expect(() => call(plugin!, 'transform', {}, '', 'input.css')).toThrow('不再接收')
    finish()
    await task
    await firstClose
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})

describe('关闭协调者', () => {
  it('watch 错误只结束轮次，永久关闭才释放', async () => {
    const dispose = vi.fn(async () => {})
    const plugin = createFrameworkRuntimeLifecycle({ getResolvedConfig: () => config(true), dispose })
    await call(plugin, 'buildEnd', {}, new Error('recoverable'))
    await call(plugin, 'closeBundle', {})
    expect(dispose).not.toHaveBeenCalled()
    const close = call(plugin, 'closeWatcher', {})
    expect(call(plugin, 'closeWatcher', {})).toBe(close)
    await close
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('serve 通过 Vite closeBundle 关闭，无需拥有 HTTP server', async () => {
    const dispose = vi.fn(async () => {})
    const resolved = { command: 'serve', build: {} } as ResolvedConfig
    const plugin = createFrameworkRuntimeLifecycle({ getResolvedConfig: () => resolved, dispose })
    await call(plugin, 'buildEnd', {}, new Error('recoverable HMR error'))
    expect(dispose).not.toHaveBeenCalled()
    const closed = call(plugin, 'closeBundle', {})
    expect(call(plugin, 'closeBundle', {})).toBe(closed)
    await closed
    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('清理某一步失败仍释放剩余资源，并保留全部错误', async () => {
    const failure = new Error('release failed')
    const events: string[] = []
    await expect(disposeViteResources([
      () => { events.push('queue') },
      () => { events.push('extension'); throw failure },
      () => { events.push('graph') },
      async () => { events.push('core') },
    ])).rejects.toMatchObject({ errors: [failure] })
    expect(events).toEqual(['queue', 'extension', 'graph', 'core'])
  })
})
