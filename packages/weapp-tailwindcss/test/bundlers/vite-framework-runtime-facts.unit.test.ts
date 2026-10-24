import type { ResolvedConfig } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { uniViteRuntimeStrategy } from '@/bundlers/vite/frameworks/shared/uni/runtime-strategy'
import { createViteFrameworkRuntimeFacts } from '@/bundlers/vite/shared/framework-runtime-facts'

describe('Vite 框架运行时只读事实', () => {
  it('配置解析前后与移除配置时保持 undefined，并且实例互不复用快照', () => {
    let config: ResolvedConfig | undefined
    const read = createViteFrameworkRuntimeFacts(() => config)
    expect(read()).toBeUndefined()
    expect(uniViteRuntimeStrategy.requiresCssHotReload?.(read())).toBe(false)
    config = { mode: 'development', plugins: [{ name: 'uni:vue' }] } as ResolvedConfig
    const first = read()
    expect(uniViteRuntimeStrategy.requiresCssHotReload?.(first)).toBe(true)
    expect(createViteFrameworkRuntimeFacts(() => config)()).not.toBe(first)
    const resolved = config
    config = undefined
    expect(read()).toBeUndefined()
    config = resolved
    expect(read()).toEqual(first)
    expect(read()).not.toBe(first)
  })

  it('只提供 mode 的配置仍可读取事实且不会误触发 uni 热更新', () => {
    const read = createViteFrameworkRuntimeFacts(() => ({ mode: 'production' }) as ResolvedConfig)
    const facts = read()
    expect(facts).toEqual({ mode: 'production', pluginNames: [] })
    expect(uniViteRuntimeStrategy.requiresCssHotReload?.(facts)).toBe(false)
    expect(read()).toBe(facts)
  })

  it('缺少 mode 的兼容配置保留原始 undefined，不会误命中尚未创建的快照', () => {
    const read = createViteFrameworkRuntimeFacts(() => ({ plugins: [{ name: 'uni:vue' }] }) as ResolvedConfig)
    const facts = read()
    expect(facts).toEqual({ mode: undefined, pluginNames: ['uni:vue'] })
    expect(uniViteRuntimeStrategy.requiresCssHotReload?.(facts)).toBe(true)
    expect(read()).toBe(facts)
  })

  it('只复制必要事实，不冻结配置或插件，未变更时不重新创建名称数组', () => {
    const config = {
      mode: 'development',
      plugins: [{ name: 'uni:vue', transform: () => 'unchanged' }],
      get root() { throw new Error('不能读取无关配置') },
    } as unknown as ResolvedConfig
    const copyNames = vi.spyOn(config.plugins, 'map')
    const read = createViteFrameworkRuntimeFacts(() => config)
    const first = read()!
    expect(Object.keys(first)).toEqual(['mode', 'pluginNames'])
    expect(first).toEqual({ mode: 'development', pluginNames: ['uni:vue'] })
    for (let index = 0; index < 10; index++) {
      expect(read()).toBe(first)
    }
    expect(copyNames).toHaveBeenCalledTimes(1)
    expect(Object.isFrozen(config)).toBe(false)
    expect(Object.isFrozen(config.plugins)).toBe(false)
    expect(Object.isFrozen(config.plugins[0])).toBe(false)
    expect(() => {
      (first as { mode: string }).mode = 'production'
    }).toThrow()
    expect(() => {
      (first.pluginNames as string[]).push('injected')
    }).toThrow()
    expect(config.mode).toBe('development')
    expect(config.plugins).toHaveLength(1)
  })

  it('同一配置的模式、名称、增删和排序变化都生成新快照，旧快照保持有效', () => {
    let config = { mode: 'development', plugins: [{ name: 'uni:vue' }, { name: 'other' }] } as ResolvedConfig
    const read = createViteFrameworkRuntimeFacts(() => config)
    const initial = read()!
    config.mode = 'production'
    const production = read()!
    expect(production.mode).toBe('production')
    expect(production).not.toBe(initial)
    config.mode = 'development'
    expect(read()).toEqual(initial)
    config.plugins[0]!.name = 'renamed'
    expect(uniViteRuntimeStrategy.requiresCssHotReload?.(read())).toBe(false)
    config.plugins.push({ name: 'uni:late' })
    expect(uniViteRuntimeStrategy.requiresCssHotReload?.(read())).toBe(true)
    config.plugins.reverse()
    expect(read()!.pluginNames).toEqual(['uni:late', 'other', 'renamed'])
    config.plugins.shift()
    expect(read()!.pluginNames).toEqual(['other', 'renamed'])
    expect(uniViteRuntimeStrategy.requiresCssHotReload?.(read())).toBe(false)
    const current = read()
    config = { mode: 'development', plugins: [{ name: 'other' }, { name: 'renamed' }] } as ResolvedConfig
    expect(read()).toBe(current)
    expect(initial).toEqual({ mode: 'development', pluginNames: ['uni:vue', 'other'] })
  })
})
