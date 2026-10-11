import { setImmediate } from 'node:timers/promises'
import { describe, expect, it, vi } from 'vitest'
import * as runtimeCache from '@/tailwindcss/runtime/cache'
import { createCompilerWithLoaderTracking, getWebpackLoaderRuntime, isCssImportRewriteLoader, path, setupWebpackV5UnitTest, testState, WeappTailwindcss } from './webpack.v5.unit/shared'

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((accept) => {
    resolve = accept
  })
  return { promise, resolve }
}

function createLoaderRuntime() {
  const fixture = createCompilerWithLoaderTracking()
  const plugin = new WeappTailwindcss()
  plugin.apply(fixture.compiler as any)
  const module = {
    resource: path.join(testState.projectRoot!, 'styles.css'),
    loaders: [{ loader: '/virtual/postcss-loader.js', options: undefined as any }],
  }
  fixture.getLoaderHandler()?.({}, module)
  const entry = module.loaders.find(isCssImportRewriteLoader)
  const runtime = getWebpackLoaderRuntime(entry?.options?.tailwindcssImportRewriteRuntimeKey)
  if (!runtime?.classSet?.getClassSet || !runtime.cssImportRewrite?.getRuntimeSet) {
    throw new Error('测试需要已注册的 Webpack loader 运行时。')
  }
  return { ...fixture, runtime, prepare: runtime.classSet.getClassSet, getRuntimeSet: runtime.cssImportRewrite.getRuntimeSet }
}

describe('Webpack loader runtime preparation lifecycle', () => {
  setupWebpackV5UnitTest()

  it('waits for runtime and watch metadata before releasing every concurrent loader', async () => {
    const gate = deferred<typeof testState.currentContext.tailwindRuntime>()
    const started = deferred<void>()
    testState.currentContext.refreshTailwindcssRuntime.mockImplementation(async () => {
      started.resolve()
      return gate.promise
    })
    const loader = createLoaderRuntime()
    const first = loader.prepare()
    await started.promise
    let secondFinished = false
    const second = Promise.resolve(loader.prepare()).then(() => {
      secondFinished = true
    })
    try {
      await setImmediate()
      expect(secondFinished).toBe(false)
      expect(testState.currentContext.tailwindRuntime.extract).not.toHaveBeenCalled()
    }
    finally {
      gate.resolve(testState.currentContext.tailwindRuntime)
      await Promise.allSettled([first, second])
    }
    expect(testState.currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
  })

  it('reuses the prepared class set without rescanning source signatures for each loader', async () => {
    const signatures = vi.spyOn(runtimeCache, 'getRuntimeClassSetSignatureWithSources')
    try {
      const loader = createLoaderRuntime()
      const prepared = await loader.getRuntimeSet()
      const count = signatures.mock.calls.length
      expect(count).toBeGreaterThan(0)
      await setImmediate()
      const results = await Promise.all([loader.getRuntimeSet(), loader.getRuntimeSet(), loader.getRuntimeSet()])
      for (const result of results) {
        expect(result).toBe(prepared)
        expect([...result]).toEqual(['beta'])
      }
      expect(signatures).toHaveBeenCalledTimes(count)
    }
    finally {
      signatures.mockRestore()
    }
  })

  it('retries preparation after a refresh failure instead of retaining a prepared flag', async () => {
    const failure = new Error('刷新失败')
    testState.currentContext.refreshTailwindcssRuntime.mockRejectedValueOnce(failure)
    const loader = createLoaderRuntime()
    await expect(loader.prepare()).rejects.toBe(failure)
    await loader.prepare()
    expect(testState.currentContext.refreshTailwindcssRuntime).toHaveBeenCalledTimes(2)
    expect(testState.currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(1)
  })

  it('collects a fresh class set when the next compilation starts', async () => {
    const loader = createLoaderRuntime()
    expect([...await loader.getRuntimeSet()]).toEqual(['beta'])
    const next = new Set(['new-class'])
    testState.currentContext.tailwindRuntime.extract.mockResolvedValue({ classSet: next })
    const reset = loader.compiler.hooks.compilation.tap.mock.calls[0][1]
    reset(loader.compilation)
    const result = await loader.getRuntimeSet()
    expect([...result]).toEqual(['new-class'])
    expect(testState.currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(2)
  })

  it('invalidates the class set when a CSS source is registered during a compilation', async () => {
    const loader = createLoaderRuntime()
    expect([...await loader.getRuntimeSet()]).toEqual(['beta'])
    const next = new Set(['source-class'])
    testState.currentContext.tailwindRuntime.extract.mockResolvedValue({ classSet: next })
    await loader.runtime.cssImportRewrite!.registerCssSource!({
      file: path.join(testState.projectRoot!, 'theme.css'),
      css: '@import "tailwindcss"; @source inline("source-class");',
    })
    expect([...await loader.getRuntimeSet()]).toEqual(['source-class'])
    expect(testState.currentContext.tailwindRuntime.extract).toHaveBeenCalledTimes(2)
  })

  it.each(['compilation', 'css-source'] as const)('keeps loaders on the latest runtime when %s changes during preparation', async (change) => {
    const previousRuntime = testState.currentContext.tailwindRuntime
    const gate = deferred<typeof previousRuntime>()
    const started = deferred<void>()
    const nextRuntime = {
      ...previousRuntime,
      extract: vi.fn(async () => ({ classSet: new Set(['latest-class']) })),
    }
    testState.currentContext.refreshTailwindcssRuntime
      .mockImplementationOnce(async () => {
        started.resolve()
        return gate.promise
      })
      .mockResolvedValue(nextRuntime)
    const loader = createLoaderRuntime()
    const previous = loader.getRuntimeSet()
    await started.promise
    try {
      if (change === 'compilation') {
        loader.compiler.hooks.compilation.tap.mock.calls[0][1](loader.compilation)
      }
      else {
        await loader.runtime.cssImportRewrite!.registerCssSource!({
          file: path.join(testState.projectRoot!, 'theme.css'),
          css: '@import "tailwindcss"; @source inline("latest-class");',
        })
      }
    }
    finally {
      gate.resolve(previousRuntime)
    }
    const results = await Promise.all([previous, loader.getRuntimeSet()])
    for (const result of results) {
      expect([...result]).toEqual(['latest-class'])
    }
    expect(testState.currentContext.refreshTailwindcssRuntime).toHaveBeenCalledTimes(change === 'compilation' ? 2 : 3)
    expect(nextRuntime.extract).toHaveBeenCalledTimes(1)
  })
})
