import type { InternalUserDefinedOptions } from '@/types'
import { afterEach, describe, expect, it } from 'vitest'
import { disposeCompilerOwner } from '@/compiler/owner-lifecycle'
import { resolveCompilationProfile } from '@/context/compilation-profile'
import { createCompilerConfigurationFingerprint } from '@/context/compiler-context-cache'
import { initializeFrameworkEnvironment } from '@/framework-policies/environment-snapshot'

interface Adapter {
  read: () => string | undefined
}

class PrivateAdapter implements Adapter {
  readonly kind = 'adapter'
  #value: string

  constructor(value: string) {
    this.#value = value
  }

  read() {
    return this.#value
  }
}

const adapterValues = new WeakMap<object, string>()

class WeakMapAdapter implements Adapter {
  readonly kind = 'adapter'

  constructor(value: string) {
    adapterValues.set(this, value)
  }

  read() {
    return adapterValues.get(this)
  }
}

class AdapterContainer {
  constructor(public adapter: unknown) {}
}

const containers = [
  { name: '直接字段', wrap: (adapter: Adapter) => adapter },
  { name: '普通记录', wrap: (adapter: Adapter) => ({ nested: { adapter } }) },
  { name: '数组', wrap: (adapter: Adapter) => [adapter] },
  { name: 'Map 值', wrap: (adapter: Adapter) => new Map([['adapter', adapter]]) },
  { name: 'Map 键', wrap: (adapter: Adapter) => new Map([[adapter, 'adapter']]) },
  { name: 'Set', wrap: (adapter: Adapter) => new Set([adapter]) },
  { name: '不透明父实例', wrap: (adapter: Adapter) => new AdapterContainer(adapter) },
  {
    name: '记录、数组、Map、Set 与不透明实例的深层组合',
    wrap: (adapter: Adapter) => ({ nested: [new Map([['adapters', new Set([{ nested: new AdapterContainer(adapter) }])]])] }),
  },
]
const adapters = [
  { name: '私有字段', create: (value: string): Adapter => new PrivateAdapter(value) },
  { name: 'WeakMap 状态', create: (value: string): Adapter => new WeakMapAdapter(value) },
]
const owners = new Set<object>()

afterEach(async () => {
  await Promise.all(Array.from(owners, owner => disposeCompilerOwner(owner)))
  owners.clear()
})

describe.each(adapters)('不透明插件后代的配置身份：$name', ({ create }) => {
  it.each(containers)('$name 中替换同枚举属性的实例会推进 revision', ({ wrap }) => {
    const firstAdapter = create('first')
    const nextAdapter = create('next')
    expect(Object.entries(firstAdapter)).toEqual(Object.entries(nextAdapter))
    expect(firstAdapter.read()).toBe('first')
    expect(nextAdapter.read()).toBe('next')

    const plugin = { postcssPlugin: 'nested-adapter', adapter: wrap(firstAdapter) }
    const context = { generator: false, cssPreflight: false, postcssOptions: { plugins: [plugin] } } as InternalUserDefinedOptions
    initializeFrameworkEnvironment(context)
    const owner = {}
    owners.add(owner)
    const first = resolveCompilationProfile(context, owner)
    expect(resolveCompilationProfile(context, owner).profile).toBe(first.profile)

    plugin.adapter = wrap(nextAdapter)
    const next = resolveCompilationProfile(context, owner)
    expect(next.profile.revision).toBe(first.profile.revision + 1)
    expect(next.profile).not.toBe(first.profile)
    expect(first.isCurrent()).toBe(false)
    expect(next.isCurrent()).toBe(true)
    expect(resolveCompilationProfile(context, owner).profile).toBe(next.profile)
  })

  it('保持所有中间插件与不透明实例不变，原位替换深层 adapter 仍使旧请求失效', () => {
    const container = new AdapterContainer(create('first'))
    const plugin = {
      postcssPlugin: 'stable-ancestors',
      adapter: new AdapterContainer({ nested: [new Map([['adapters', new Set([container])]])] }),
    }
    const context = { generator: false, cssPreflight: false, postcssOptions: { plugins: [plugin] } } as InternalUserDefinedOptions
    initializeFrameworkEnvironment(context)
    const owner = {}
    owners.add(owner)
    const first = resolveCompilationProfile(context, owner)
    const signature = createCompilerConfigurationFingerprint(plugin, { preserveOpaqueIdentity: true })
    const genericSignature = createCompilerConfigurationFingerprint(plugin)

    container.adapter = create('next')
    const next = resolveCompilationProfile(context, owner)
    expect(next.profile.revision).toBe(first.profile.revision + 1)
    expect(first.isCurrent()).toBe(false)
    expect(next.isCurrent()).toBe(true)
    expect(createCompilerConfigurationFingerprint(plugin, { preserveOpaqueIdentity: true })).not.toBe(signature)
    expect(createCompilerConfigurationFingerprint(plugin)).toBe(genericSignature)
  })

  it.each(containers)('$name 中的默认通用指纹继续按可枚举内容比较', ({ wrap }) => {
    const plugin = { postcssPlugin: 'nested-adapter', adapter: wrap(create('first')) }
    const first = createCompilerConfigurationFingerprint(plugin)
    const explicit = createCompilerConfigurationFingerprint(plugin, { preserveOpaqueIdentity: false })
    plugin.adapter = wrap(create('next'))
    expect(createCompilerConfigurationFingerprint(plugin)).toBe(first)
    expect(createCompilerConfigurationFingerprint(plugin, { preserveOpaqueIdentity: false })).toBe(explicit)
  })
})

describe('不透明实例递归的环检测', () => {
  it.each([false, true])('preserveOpaqueIdentity=%s 时继续拒绝循环配置', (preserveOpaqueIdentity) => {
    const plugin: { postcssPlugin: string, adapter?: unknown } = { postcssPlugin: 'circular-adapter' }
    plugin.adapter = { nested: [new Map([['plugins', new Set([plugin])]])] }
    expect(() => createCompilerConfigurationFingerprint(plugin, { preserveOpaqueIdentity })).toThrow('circular structure')
  })
})
