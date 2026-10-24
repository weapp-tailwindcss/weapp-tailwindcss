import { describe, expect, it, vi } from 'vitest'
import { resolveWebpackLoaderRuntime } from '@/bundlers/webpack/loaders/runtime-registry'
import generationLoader from '@/bundlers/webpack/loaders/weapp-tw-css-generation-loader'
import rewriteLoader from '@/bundlers/webpack/loaders/weapp-tw-css-import-rewrite-loader'
import classSetLoader from '@/bundlers/webpack/loaders/weapp-tw-runtime-classset-loader'
import { createAssetsFromStore, createCompilerWithLoaderTracking, setupWebpackV5UnitTest, testState, WeappTailwindcss } from './webpack.v5.unit/shared'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

describe('Webpack 完整操作与关闭协调', () => {
  setupWebpackV5UnitTest()

  it('processAssets 转换与产物提交结束后才释放状态', async () => {
    const started = deferred()
    const gate = deferred()
    testState.currentContext.templateHandler.mockImplementation(async (source: string) => {
      started.resolve()
      await gate.promise
      return `converted:${source}`
    })
    const fixture = createCompilerWithLoaderTracking()
    new WeappTailwindcss().apply(fixture.compiler as any)
    const processAssets = fixture.compilation.hooks.processAssets.tapPromise.mock.calls[0]![1]
    const finalizer = fixture.compilation.hooks.processAssets.tapPromise.mock.calls[1]![1]
    const close = fixture.compiler.hooks.watchClose.tap.mock.calls[0]![1]
    const assets = createAssetsFromStore({ 'entry.wxml': '<view class="beta" />' })
    const task = processAssets(assets)
    await started.promise
    let closed = false
    const closing = close().then(() => {
      closed = true
    })
    await expect(processAssets(assets)).rejects.toThrow('正在释放')
    await expect(finalizer({})).rejects.toThrow('正在释放')
    expect(closed).toBe(false)
    expect(fixture.compilation.updateAsset).not.toHaveBeenCalled()
    gate.resolve()
    await task
    await closing
    expect(fixture.compilation.updateAsset).toHaveBeenCalledTimes(1)
    await expect(processAssets(assets)).rejects.toThrow('已释放')
    expect(() => fixture.getLoaderHandler()?.({}, { loaders: [] })).toThrow('已释放')
  })

  it.each(['processAssets', 'finalizer', 'rewrite', 'generation', 'classset'] as const)(
    '%s 在 handler 异步后续中重入仍按新宿主任务拒绝',
    async (entrypoint) => {
      const context = testState.currentContext
      const templateHandler = context.templateHandler
      const release = vi.fn(async () => {})
      ;(context as any).__internalWebpackRuntimeClassSetManager = { reset: release }
      let closing: Promise<void> | undefined
      templateHandler.mockImplementation(async (source: string) => {
        await Promise.resolve()
        closing = close()
        await expect(reenter()).rejects.toThrow('正在释放')
        expect(release).not.toHaveBeenCalled()
        // 原任务关闭前已经接收，仍可完成内部候选准备和产物提交。
        await runtime!.classSet!.getClassSet!()
        return `converted:${source}`
      })
      const fixture = createCompilerWithLoaderTracking()
      new WeappTailwindcss().apply(fixture.compiler as any)
      const processAssets = fixture.compilation.hooks.processAssets.tapPromise.mock.calls[0]![1]
      const finalizer = fixture.compilation.hooks.processAssets.tapPromise.mock.calls[1]![1]
      const close = fixture.compiler.hooks.watchClose.tap.mock.calls[0]![1]
      const runtime = resolveWebpackLoaderRuntime(undefined, fixture.compiler)
      expect(runtime?.classSet?.getClassSet).toBeTypeOf('function')
      const loaderContext = {
        _compiler: fixture.compiler,
        getOptions: () => ({}),
        resourcePath: 'ordinary.css',
      }
      const reenter = async () => {
        switch (entrypoint) {
          case 'processAssets': return processAssets({})
          case 'finalizer': return finalizer({})
          case 'rewrite': return rewriteLoader.call(loaderContext as any, '.ordinary {}')
          case 'generation': return generationLoader.call(loaderContext as any, '.ordinary {}')
          case 'classset': return classSetLoader.call(loaderContext as any, '.ordinary {}')
        }
      }
      try {
        await processAssets(createAssetsFromStore({ 'entry.wxml': '<view class="beta" />' }))
      }
      finally {
        await closing
      }
      expect(templateHandler).toHaveBeenCalledTimes(1)
      expect(fixture.compilation.updateAsset).toHaveBeenCalledTimes(1)
      expect(release).toHaveBeenCalledTimes(1)
      await expect(reenter()).rejects.toThrow('已释放')
      expect(() => resolveWebpackLoaderRuntime(undefined, fixture.compiler)).toThrow('已释放')
    },
  )

  it('并发转换之一失败后仍等待其余已接受任务再关闭', async () => {
    const gate = deferred()
    const started = deferred()
    const release = vi.fn(async () => {})
    ;(testState.currentContext as any).__internalWebpackRuntimeClassSetManager = { reset: release }
    testState.currentContext.templateHandler.mockImplementation(async (source: string) => {
      if (source === 'fail') {
        throw new Error('parallel failed')
      }
      started.resolve()
      await gate.promise
      return 'converted'
    })
    const fixture = createCompilerWithLoaderTracking()
    new WeappTailwindcss().apply(fixture.compiler as any)
    const processAssets = fixture.compilation.hooks.processAssets.tapPromise.mock.calls[0]![1]
    const task = processAssets(createAssetsFromStore({ 'first.wxml': 'fail', 'second.wxml': 'wait' }))
    const failed = expect(task).rejects.toThrow('parallel failed')
    await started.promise
    await failed
    const closing = fixture.compiler.hooks.watchClose.tap.mock.calls[0]![1]()
    expect(release).not.toHaveBeenCalled()
    gate.resolve()
    await closing
    expect(fixture.compilation.updateAsset).toHaveBeenCalledTimes(1)
    expect(release).toHaveBeenCalledTimes(1)
  })

  it('onLoad 初始化失败仍注册永久关闭协调者', async () => {
    const failure = new Error('onLoad failed')
    testState.currentContext.onLoad.mockImplementation(() => {
      throw failure
    })
    const fixture = createCompilerWithLoaderTracking()
    expect(() => new WeappTailwindcss().apply(fixture.compiler as any)).toThrow(failure)
    const close = fixture.compiler.hooks.watchClose.tap.mock.calls[0]![1]
    const first = close()
    expect(close()).toBe(first)
    await first
    expect(() => fixture.compiler.hooks.compilation.tap.mock.calls[0]![1](fixture.compilation)).toThrow('已释放')
  })

  it('loader hook 初始化失败释放已注册的 compiler runtime', async () => {
    const failure = new Error('loader setup failed')
    const fixture = createCompilerWithLoaderTracking()
    fixture.compiler.webpack.NormalModule.getCompilationHooks.mockImplementation(() => {
      throw failure
    })
    expect(() => new WeappTailwindcss().apply(fixture.compiler as any)).toThrow(failure)
    await fixture.compiler.hooks.watchClose.tap.mock.calls[0]![1]()
    expect(() => resolveWebpackLoaderRuntime(undefined, fixture.compiler)).toThrow('已释放')
  })

  it('watch 转换失败可以重试当前实例', async () => {
    testState.currentContext.templateHandler.mockRejectedValueOnce(new Error('recoverable'))
    const fixture = createCompilerWithLoaderTracking()
    new WeappTailwindcss().apply(fixture.compiler as any)
    const processAssets = fixture.compilation.hooks.processAssets.tapPromise.mock.calls[0]![1]
    const assets = createAssetsFromStore({ 'entry.wxml': '<view class="beta" />' })
    await expect(processAssets(assets)).rejects.toThrow('recoverable')
    await processAssets(assets)
    expect(fixture.compilation.updateAsset).toHaveBeenCalledTimes(1)
    await fixture.compiler.hooks.watchClose.tap.mock.calls[0]![1]()
  })
})
