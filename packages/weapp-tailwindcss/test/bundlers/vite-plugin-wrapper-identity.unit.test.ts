import type { Plugin } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { createGenericWebVitePlugins } from '@/bundlers/vite/frameworks/generic/web'
import { createViteFrameworkPlugins } from '@/bundlers/vite/shared/create-framework-plugins'
import { getVitePluginCleanup } from '@/bundlers/vite/shared/plugin-cleanup-bridge'
import { createDeferredVitePlugins } from '@/bundlers/vite/shared/plugin-slots'

const runtime = vi.hoisted(() => ({ plugins: [] as Plugin[] }))
vi.mock('@/bundlers/vite/shared/create-framework-plugins-runtime', () => ({ createViteFrameworkPlugins: () => runtime.plugins }))
vi.mock('@/bundlers/vite/shared/create-css-only-plugins-runtime', () => ({ createCssOnlyVitePlugins: () => runtime.plugins }))

function wrap(name: string) {
  return name === 'framework'
    ? createViteFrameworkPlugins({}, { frameworkName: 'identity-fixture', styleInjectorDelegate: Object.assign(() => [], { slots: [] }) })
    : createGenericWebVitePlugins({})
}

describe('生产来源关系包装保留插件身份', () => {
  it.each(['framework', 'generic-web'])('%s 保留私有清理桥和非枚举 api 描述符', (name) => {
    const plugins = createDeferredVitePlugins([{ name: 'inner', hooks: { watchChange: true } }], () => [{ name: 'inner', watchChange() {} }])
    const original = plugins[0]!
    const descriptor = Object.getOwnPropertyDescriptor(original, 'api')
    const cleanup = getVitePluginCleanup(original)
    runtime.plugins = plugins
    const wrapped = wrap(name)![0]!
    expect(wrapped).toBe(original)
    expect(Object.getOwnPropertyDescriptor(wrapped, 'api')).toEqual(descriptor)
    expect(getVitePluginCleanup(wrapped as Plugin)).toBe(cleanup)
  })

  it.each(['framework', 'generic-web'])('%s 包装真实钩子时保留元数据、this 和返回值', (name) => {
    const context = {}
    const result = Promise.resolve()
    runtime.plugins = [{ name: 'inner', watchChange: { order: 'post', sequential: true, handler() {
      expect(this).toBe(context)
      return result
    } } }]
    const wrapped = wrap(name)![0] as Plugin
    const hook = wrapped.watchChange
    expect(hook).toMatchObject({ order: 'post', sequential: true })
    if (!hook || typeof hook === 'function') {
      throw new Error('预期保留对象形式的 watchChange')
    }
    expect(Reflect.apply(hook.handler, context, ['fixture.css', { event: 'update' }])).toBe(result)
  })
})
