import type { WebpackLoaderRuntimeEntry } from '@/bundlers/webpack/loaders/runtime-registry'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deleteWebpackLoaderRuntime, resolveWebpackLoaderRuntime, setWebpackLoaderRuntime } from '@/bundlers/webpack/loaders/runtime-registry'
import generationLoader from '@/bundlers/webpack/loaders/weapp-tw-css-generation-loader'
import rewriteLoader from '@/bundlers/webpack/loaders/weapp-tw-css-import-rewrite-loader'
import classSetLoader from '@/bundlers/webpack/loaders/weapp-tw-runtime-classset-loader'
import { runCompilerOwnerActivity, runCompilerOwnerDisposal } from '@/compiler/compiler-owner-state'

const registrations: Array<{ key: string, compiler: object }> = []
afterEach(() => {
  for (const { key, compiler } of registrations.splice(0)) {
    deleteWebpackLoaderRuntime(key, compiler)
  }
})

function register(entry: WebpackLoaderRuntimeEntry) {
  const compiler = {}
  const key = `loader-session-${registrations.length}`
  registrations.push({ key, compiler })
  setWebpackLoaderRuntime(key, entry, compiler)
  return { key, compiler }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(accept => { resolve = accept })
  return { promise, resolve }
}

describe('Webpack loader 的会话归属', () => {
  it('静态规则依赖自身 compiler，缺少身份时不回退到其他项目', () => {
    const first = { cssImportRewrite: { pkgDir: 'first' } }
    const second = { cssImportRewrite: { pkgDir: 'second' } }
    const a = register(first)
    register(second)
    expect(resolveWebpackLoaderRuntime(undefined, a.compiler)).toBe(first)
    expect(resolveWebpackLoaderRuntime()).toBeUndefined()
    deleteWebpackLoaderRuntime(a.key, a.compiler)
    expect(() => resolveWebpackLoaderRuntime(a.key)).toThrow('已释放')
    expect(() => resolveWebpackLoaderRuntime(undefined, a.compiler)).toThrow('已释放')
  })

  it.each([
    ['rewrite', rewriteLoader],
    ['generation', generationLoader],
  ] as const)('%s 在来源登记期间关闭时排空已接受任务并拒绝新任务', async (_name, loader) => {
    const owner = {}
    const gate = deferred()
    const started = deferred()
    const finished = vi.fn()
    const cleanup = vi.fn()
    const runtime = register({
      cssImportRewrite: {
        pkgDir: '',
        run: activity => runCompilerOwnerActivity(owner, activity),
        registerCssSource: async () => {
          started.resolve()
          await gate.promise
          await runCompilerOwnerActivity(owner, finished)
        },
      },
    })
    const context = {
      _compiler: runtime.compiler,
      getOptions: () => ({}),
      resourcePath: 'theme.css',
    }
    const call = () => loader.call(context as any, '@import "tailwindcss";')
    const task = call()
    await started.promise
    const close = runCompilerOwnerDisposal(owner, async () => { cleanup() })
    await expect(call()).rejects.toThrow('正在释放')
    expect(cleanup).not.toHaveBeenCalled()
    gate.resolve()
    await task
    await close
    expect(finished).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
    await expect(call()).rejects.toThrow('已释放')
  })

  it('classset loader 在候选准备和依赖登记之后才释放任务', async () => {
    const owner = {}
    const gate = deferred()
    const started = deferred()
    const dependencies = vi.fn(() => ({ files: [] }))
    const cleanup = vi.fn()
    const runtime = register({
      classSet: {
        run: activity => runCompilerOwnerActivity(owner, activity),
        getClassSet: async () => { started.resolve(); await gate.promise },
        getWatchDependencies: dependencies,
      },
    })
    const context = { _compiler: runtime.compiler, getOptions: () => ({}), resourcePath: 'theme.css' }
    const task = classSetLoader.call(context as any, '.a {}')
    await started.promise
    const close = runCompilerOwnerDisposal(owner, async () => { cleanup() })
    expect(cleanup).not.toHaveBeenCalled()
    await expect(classSetLoader.call(context as any, '.a {}')).rejects.toThrow('正在释放')
    gate.resolve()
    await task
    await close
    expect(dependencies).toHaveBeenCalledTimes(1)
    expect(cleanup).toHaveBeenCalledTimes(1)
  })
})
