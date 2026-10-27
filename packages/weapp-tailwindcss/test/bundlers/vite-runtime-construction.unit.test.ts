import type { Plugin, ResolvedConfig } from 'vite'
import type { ViteFrameworkBranchContext } from '@/bundlers/vite/shared/create-framework-plugins'
import type { CompilerRuntimeState } from '@/compiler/runtime-state'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WeappTailwindcss } from '@/bundlers/vite'
import * as runtimeClassSet from '@/bundlers/vite/runtime-class-set'
import { createCssOnlyVitePlugins } from '@/bundlers/vite/shared/create-css-only-plugins-runtime'
import { createViteFrameworkPlugins } from '@/bundlers/vite/shared/create-framework-plugins-runtime'
import { settleVitePluginConstructionFailure } from '@/bundlers/vite/shared/plugin-construction'
import { ensureCompilerOwnerActive, runCompilerOwnerActivity } from '@/compiler/compiler-owner-state'
import { createCompilerContextMock, createContext, resetVitePluginTestContext } from './vite-plugin.testkit'

const branch = {
  frameworkName: 'generic',
  styleInjectorDelegate: Object.assign(() => [], { slots: [] }),
} satisfies ViteFrameworkBranchContext

function failureOf(create: () => unknown) {
  try {
    create()
  }
  catch (error) {
    return error
  }
  throw new Error('预期真实插件工厂构造失败')
}

describe('生产 Vite 工厂构造失败的资源归属', () => {
  const runtimes: CompilerRuntimeState[] = []
  const runtimeDisposals: ReturnType<typeof vi.spyOn>[] = []

  beforeEach(() => {
    resetVitePluginTestContext()
    runtimes.length = 0
    runtimeDisposals.length = 0
    const create = runtimeClassSet.createViteRuntimeClassSet
    vi.spyOn(runtimeClassSet, 'createViteRuntimeClassSet').mockImplementation((options) => {
      const value = create(options)
      runtimes.push(value.runtimeState)
      runtimeDisposals.push(vi.spyOn(value.runtimeState, 'dispose'))
      return value
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it.each(['asset', 'onLoad', 'extras', 'ordering'] as const)('完整工厂在 %s 阶段失败时释放已创建资源', async (stage) => {
    const failure = new Error(`${stage} factory failed`)
    const closeExtension = vi.fn()
    const relations = vi.fn()
    const options = createContext({
      appType: 'native',
      onLoad() {
        if (stage === 'onLoad') {
          throw failure
        }
      },
    })
    const error = failureOf(() => createViteFrameworkPlugins(options, {
      ...branch,
      createAssetPipeline() {
        if (stage === 'asset') {
          throw failure
        }
        return {}
      },
      createExtraPlugins() {
        if (stage === 'extras') {
          throw failure
        }
        return [{ name: 'partial-extension', closeWatcher: closeExtension }]
      },
      sourceCandidatesBeforeExtraPlugin() {
        if (stage === 'ordering') {
          throw failure
        }
        return false
      },
    }, relations))
    expect(relations).not.toHaveBeenCalled()
    await expect(settleVitePluginConstructionFailure(error)).rejects.toBe(failure)
    expect(relations).toHaveBeenCalledExactlyOnceWith()
    expect(closeExtension).toHaveBeenCalledTimes(stage === 'ordering' ? 1 : 0)
    for (const [index, runtime] of runtimes.entries()) {
      expect(() => ensureCompilerOwnerActive(runtime)).toThrow('已释放')
      expect(runtimeDisposals[index]).toHaveBeenCalledExactlyOnceWith()
    }
    expect(runtimes).toHaveLength(stage === 'asset' ? 0 : 1)
  })

  it('构造失败等待已接收的编译工作；关系释放失败也不跳过核心关闭', async () => {
    const gate = Promise.withResolvers<void>()
    const failure = new Error('onLoad failed')
    const cleanupFailure = new Error('relations failed')
    let task: Promise<void> | undefined
    const options = createContext({
      onLoad() {
        task = runCompilerOwnerActivity(runtimes[0]!, () => gate.promise)
        throw failure
      },
    })
    const error = failureOf(() => createViteFrameworkPlugins(options, branch, () => {
      throw cleanupFailure
    }))
    const completion = settleVitePluginConstructionFailure(error)!
    let settled = false
    const result = completion.catch((error) => {
      settled = true
      return error as AggregateError
    })
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(runtimeDisposals[0]).not.toHaveBeenCalled()
    gate.resolve()
    await task
    expect(await result).toMatchObject({ errors: [failure, cleanupFailure] })
    expect(runtimeDisposals[0]).toHaveBeenCalledExactlyOnceWith()
    expect(() => ensureCompilerOwnerActive(runtimes[0]!)).toThrow('已释放')
  })

  it('构造期间已接受的样式服务先完成，再释放部分创建的扩展及核心', async () => {
    const gate = Promise.withResolvers<{ css: string }>()
    const failure = new Error('ordering failed')
    const events: string[] = []
    let task: Promise<unknown> | undefined
    const options = createContext({ styleHandler: () => gate.promise })
    const error = failureOf(() => createViteFrameworkPlugins(options, {
      ...branch,
      createExtraPlugins(services) {
        task = services.transformStyle('.fixture {}')
        return [{ name: 'partial-extension', closeWatcher() {
          events.push('extension')
        } }]
      },
      sourceCandidatesBeforeExtraPlugin() {
        throw failure
      },
    }, () => {
      events.push('relations')
    }))
    const completion = settleVitePluginConstructionFailure(error)!
    const rejection = expect(completion).rejects.toBe(failure)
    await Promise.resolve()
    expect(events).toEqual([])
    expect(runtimeDisposals[0]).not.toHaveBeenCalled()
    gate.resolve({ css: '.fixture {}' })
    await task
    await rejection
    expect(events).toEqual(['extension', 'relations'])
    expect(runtimeDisposals[0]).toHaveBeenCalledExactlyOnceWith()
  })

  it('CSS-only 的注入工厂失败释放核心，下一次独立构造仍可正常关闭', async () => {
    const failure = new Error('injector factory failed')
    const relations = vi.fn()
    const options = createContext({
      appType: undefined,
      styleInjector: {},
      __internalViteWebStyleInjectorFactory() {
        throw failure
      },
    })
    const error = failureOf(() => createCssOnlyVitePlugins(options as any, {}, relations))
    await expect(settleVitePluginConstructionFailure(error)).rejects.toBe(failure)
    expect(relations).toHaveBeenCalledExactlyOnceWith()
    expect(() => ensureCompilerOwnerActive(runtimes[0]!)).toThrow('已释放')
    expect(runtimeDisposals[0]).toHaveBeenCalledExactlyOnceWith()

    const plugins = createCssOnlyVitePlugins(createContext({ appType: undefined }) as any)!
    expect(() => ensureCompilerOwnerActive(runtimes[1]!)).not.toThrow()
    const lifecycle = plugins.find(plugin => plugin.name === 'weapp-tailwindcss:runtime-lifecycle')!
    const hook = lifecycle.closeWatcher!
    const handler = typeof hook === 'function' ? hook : hook.handler
    const closing = handler.call({} as never)
    expect(handler.call({} as never)).toBe(closing)
    await closing
    expect(() => ensureCompilerOwnerActive(runtimes[1]!)).toThrow('已释放')
    expect(runtimeDisposals[1]).toHaveBeenCalledExactlyOnceWith()
  })

  it.each(['framework', 'css-only'] as const)('%s 的 disabled 入口只保留重写能力，不分配编译上下文', async (kind) => {
    for (const rewriteCssImports of [false, true]) {
      const relations = vi.fn()
      const options = { disabled: { plugin: true }, rewriteCssImports }
      const plugins = (kind === 'framework'
        ? createViteFrameworkPlugins(options, branch, relations)
        : createCssOnlyVitePlugins(options, {}, relations)) as Plugin[] | undefined
      expect(plugins?.length ?? 0).toBe(rewriteCssImports ? 1 : 0)
      expect(relations).toHaveBeenCalledExactlyOnceWith()
      if (rewriteCssImports) {
        const hook = plugins![0]!.transform!
        const handler = typeof hook === 'function' ? hook : hook.handler
        const result = await handler.call({} as never, '@import "tailwindcss";', 'entry.css')
        expect(result).toMatchObject({ code: expect.not.stringContaining('@import "tailwindcss";'), map: null })
      }
    }
    expect(createCompilerContextMock).not.toHaveBeenCalled()
    expect(runtimes).toHaveLength(0)
  })

  it('公开 disabled 入口保持原有 onLoad 与编译上下文均不执行的语义', async () => {
    const onLoad = vi.fn()
    const options = { disabled: { plugin: true }, appType: 'native' as const, onLoad }
    expect(WeappTailwindcss(options)).toBeUndefined()
    const plugins = WeappTailwindcss({ ...options, rewriteCssImports: true }) as Plugin[]
    const config = { command: 'build', root: process.cwd(), build: {} } as ResolvedConfig
    for (const plugin of plugins) {
      const hook = plugin.configResolved
      const handler = typeof hook === 'function' ? hook : hook?.handler
      await handler?.call({} as never, config)
    }
    expect(plugins).toHaveLength(1)
    const hook = plugins[0]!.transform!
    const transform = typeof hook === 'function' ? hook : hook.handler
    const transformed = await transform.call({} as never, '@import "tailwindcss";', 'entry.css')
    expect(transformed).toMatchObject({ code: expect.not.stringContaining('@import "tailwindcss";'), map: null })
    expect(onLoad).not.toHaveBeenCalled()
    expect(createCompilerContextMock).not.toHaveBeenCalled()
    expect(runtimes).toHaveLength(0)
  })
})
