import { describe, expect, it, vi } from 'vitest'
import { createCompilerWithLoaderTracking, createContext, getCompilerContextMock, getWebpackLoaderRuntime, isCssImportRewriteLoader, path, setupWebpackV5UnitTest, testState, WeappTailwindcss } from './webpack.v5.unit/shared'

describe('Webpack 框架扩展隔离', () => {
  setupWebpackV5UnitTest()

  it.each(['taro', 'uni-app', 'weapp-vite', undefined])('MPX loader 扩展不污染交错使用的 %s compiler', (appType) => {
    const mpx = createCompilerWithLoaderTracking()
    const other = createCompilerWithLoaderTracking()
    testState.currentContext = createContext({ appType: 'mpx', rewriteCssImports: true })
    getCompilerContextMock.mockReturnValue(testState.currentContext)
    new WeappTailwindcss().apply(mpx.compiler as any)
    testState.currentContext = createContext({ appType, rewriteCssImports: true })
    getCompilerContextMock.mockReturnValue(testState.currentContext)
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
      ;(close as () => void)()
    }
    expect(getWebpackLoaderRuntime(mpxKey)).toBeUndefined()
    expect(getWebpackLoaderRuntime(otherKey)).toBeDefined()
    for (const [, close] of other.compiler.hooks.watchClose.tap.mock.calls) {
      ;(close as () => void)()
    }
  })

  it('关闭 CSS import 重写时不安装 MPX resolver 和预处理规则', () => {
    testState.currentContext = createContext({ appType: 'mpx', rewriteCssImports: false })
    getCompilerContextMock.mockReturnValue(testState.currentContext)
    const { compiler, getLoaderHandler } = createCompilerWithLoaderTracking()
    new WeappTailwindcss().apply(compiler as any)
    const resolve = vi.fn()
    const context = { resolve }
    getLoaderHandler()!(context, { resource: 'entry.css', loaders: [] })
    expect(context.resolve).toBe(resolve)
    expect((compiler as any).options.resolve?.alias?.tailwindcss).toBeUndefined()
    expect((compiler as any).options.module?.rules).toBeUndefined()
    for (const [, close] of compiler.hooks.watchClose.tap.mock.calls) {
      ;(close as () => void)()
    }
  })
})
