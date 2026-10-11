import type { ResolvedConfig } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { createConfigScopedPlugins } from '@/bundlers/vite/shared/config-scoped-plugins'

describe('Vite 配置实例隔离', () => {
  it('多配置钩子交错时按环境路由，释放互不干扰', async () => {
    let created = 0
    const disposed: number[] = []
    const create = vi.fn(() => {
      const id = ++created
      return [{
        name: 'scoped',
        configResolved() {},
        transform: { order: 'pre', handler: () => id },
        closeBundle: () => { disposed.push(id) },
      }]
    })
    const [plugin] = createConfigScopedPlugins(create)!
    const first = {} as ResolvedConfig
    const second = {} as ResolvedConfig
    const a = { environment: { config: first } }
    const b = { environment: { config: second } }
    plugin!.configResolved.call(a, first)
    plugin!.configResolved.call(b, second)
    plugin!.configResolved.call(b, second)
    expect(created).toBe(2)
    expect(plugin!.transform.order).toBe('pre')
    expect(plugin!.transform.handler.call(a)).toBe(1)
    expect(plugin!.transform.handler.call(b)).toBe(2)
    plugin!.closeBundle.call(a)
    expect(disposed).toEqual([1])
    expect(plugin!.transform.handler.call(b)).toBe(2)
    plugin!.closeBundle.call(b)
    expect(disposed).toEqual([1, 2])
  })
})
