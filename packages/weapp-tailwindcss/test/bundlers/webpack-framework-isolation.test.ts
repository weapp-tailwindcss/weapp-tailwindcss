import { describe, expect, it, vi } from 'vitest'
import { createCompilerWithLoaderTracking, createContext, createCompilerContextMock, getWebpackLoaderRuntime, isCssImportRewriteLoader, path, setupWebpackV5UnitTest, testState, WeappTailwindcss } from './webpack.v5.unit/shared'

describe('Webpack 框架扩展隔离', () => {
  setupWebpackV5UnitTest()

  it.each(['taro', 'uni-app', 'weapp-vite', undefined])('MPX loader 扩展不污染交错使用的 %s compiler', async (appType) => {
    const mpx = createCompilerWithLoaderTracking()
    const other = createCompilerWithLoaderTracking()
    testState.currentContext = createContext({ appType: 'mpx', rewriteCssImports: true })
    createCompilerContextMock.mockReturnValue(testState.currentContext)
    new WeappTailwindcss().apply(mpx.compiler as any)
    testState.currentContext = createContext({ appType, rewriteCssImports: true })
    createCompilerContextMock.mockReturnValue(testState.currentContext)
    new WeappTailwindcss().apply(other.compiler as any)

    const mpxResolve = vi.fn()
    const otherResolve = vi.fn()
    const mpxLoaderContext = { resolve: mpxResolve }
    const otherLoaderContext = { resolve: otherResolve }
    const createModule = () => ({ resource: path.join(testState.projectRoot!, 'entry.css'), loaders: [{ loader: 'postcss-loader' }] })
    const mpxModule = createModule()
    const otherModule = createModule()
    other.getLoaderHandler()!(otherLoaderContext, otherModule)
    mpx.getLoaderHandler()!(mpxLoaderContext, mpxModule)

    expect(otherLoaderContext.resolve).toBe(otherResolve)
    expect(mpxLoaderContext.resolve).not.toBe(mpxResolve)
    expect((mpx.compiler as any).options.resolve.alias.tailwindcss).toBeDefined()
    expect((mpx.compiler as any).options.module.rules).toHaveLength(2)
    expect((other.compiler as any).options.resolve?.alias?.tailwindcss).toBeUndefined()
    expect((other.compiler as any).options.module?.rules).toBeUndefined()

    const runtimeKey = (module: typeof mpxModule) => (module.loaders.find(isCssImportRewriteLoader) as any).options.tailwindcssImportRewriteRuntimeKey as string
    const mpxKey = runtimeKey(mpxModule)
    const otherKey = runtimeKey(otherModule)
    expect(mpxKey).not.toBe(otherKey)
    expect(getWebpackLoaderRuntime(mpxKey)).toBeDefined()
    expect(getWebpackLoaderRuntime(otherKey)).toBeDefined()
    for (const [, close] of mpx.compiler.hooks.watchClose.tap.mock.calls) {
      await (close as () => Promise<void>)()
    }
    expect(getWebpackLoaderRuntime(mpxKey)).toBeUndefined()
    expect(getWebpackLoaderRuntime(otherKey)).toBeDefined()
    for (const [, close] of other.compiler.hooks.watchClose.tap.mock.calls) {
      await (close as () => Promise<void>)()
    }
  })


  it('同一插件配置重复 apply 为每个 compiler 创建独立 context', async () => {
    const first = createContext()
    const second = createContext()
    first.refreshTailwindcssRuntime.mockImplementation(async () => first.tailwindRuntime)
    second.refreshTailwindcssRuntime.mockImplementation(async () => second.tailwindRuntime)
    first.tailwindRuntime.extract.mockResolvedValue({ classSet: new Set(['first']) })
    second.tailwindRuntime.extract.mockResolvedValue({ classSet: new Set(['second']) })
    createCompilerContextMock.mockReturnValueOnce(first).mockReturnValueOnce(second)
    const plugin = new WeappTailwindcss({ appType: 'taro' })
    const a = createCompilerWithLoaderTracking()
    const b = createCompilerWithLoaderTracking()
    plugin.apply(a.compiler as any)
    expect(plugin.options).toBe(first)
    plugin.apply(b.compiler as any)
    expect(plugin.options).toBe(second)
    expect(createCompilerContextMock).toHaveBeenCalledTimes(2)
    expect(first.cache).not.toBe(second.cache)
    expect(first.tailwindRuntime).not.toBe(second.tailwindRuntime)
    const runtime = (fixture: typeof a) => {
      const module = { resource: path.join(testState.projectRoot!, 'entry.css'), loaders: [{ loader: 'postcss-loader' }] }
      fixture.getLoaderHandler()!({}, module)
      const key = (module.loaders.find(isCssImportRewriteLoader) as any).options.tailwindcssImportRewriteRuntimeKey
      return getWebpackLoaderRuntime(key)!.cssImportRewrite!
    }
    const firstRuntime = runtime(a)
    const secondRuntime = runtime(b)
    expect([...await firstRuntime.getRuntimeSet!()]).toEqual(['first'])
    expect([...await secondRuntime.getRuntimeSet!()]).toEqual(['second'])
    await (a.compiler.hooks.watchClose.tap.mock.calls[0]![1] as () => Promise<void>)()
    await expect(firstRuntime.getRuntimeSet!()).rejects.toThrow('已释放')
    expect([...await secondRuntime.getRuntimeSet!()]).toEqual(['second'])
    await (b.compiler.hooks.watchClose.tap.mock.calls[0]![1] as () => Promise<void>)()
  })

  it('同一内部 context 仅首次转移所有权，后续框架实例创建新 context', async () => {
    const { GenericWebpackPlugin } = await import('@/bundlers/webpack/frameworks/generic')
    const shared = createContext()
    const fresh = createContext()
    createCompilerContextMock.mockReturnValue(fresh)
    const first = new GenericWebpackPlugin(shared as any)
    expect(first.options).toBe(shared)
    expect(createCompilerContextMock).not.toHaveBeenCalled()
    const second = new GenericWebpackPlugin(shared as any)
    expect(second.options).toBe(fresh)
    expect(createCompilerContextMock).toHaveBeenCalledTimes(1)
  })

  it('关闭 CSS import 重写时不安装 MPX resolver 和预处理规则', async () => {
    testState.currentContext = createContext({ appType: 'mpx', rewriteCssImports: false })
    createCompilerContextMock.mockReturnValue(testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    new WeappTailwindcss().apply(compiler as any)
    const resolve = vi.fn()
    const context = { resolve }
    getLoaderHandler()!(context, { resource: 'entry.css', loaders: [] })
    expect(context.resolve).toBe(resolve)
    expect((compiler as any).options.resolve?.alias?.tailwindcss).toBeUndefined()
    expect((compiler as any).options.module?.rules).toBeUndefined()
    for (const [, close] of compiler.hooks.watchClose.tap.mock.calls) {
      await (close as () => Promise<void>)()
    }
  })
})
