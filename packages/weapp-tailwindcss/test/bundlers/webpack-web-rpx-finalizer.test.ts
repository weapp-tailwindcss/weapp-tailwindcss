import { Buffer } from 'node:buffer'
import fs from 'node:fs'
import path from 'node:path'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { injectWebRpxFinalizer } from '@/bundlers/webpack/BaseUnifiedPlugin/v5-loaders/web-rpx-finalizer'
import { deleteWebpackLoaderRuntime, setWebpackLoaderRuntime } from '@/bundlers/webpack/loaders/runtime-registry'
import loader from '@/bundlers/webpack/loaders/weapp-tw-web-rpx-finalize-loader'
import { disposeCompilerOwner } from '@/compiler'
import { createCompilerContext } from '@/context'

type RawSourceMap = ReturnType<NonNullable<postcss.Result['map']>['toJSON']>

function invoke(context: object, source: string | Buffer, map?: object, meta?: object) {
  return new Promise<{ css: string | Buffer, map?: RawSourceMap, meta?: any }>((resolve, reject) => {
    const callback = vi.fn((error, css, resultMap, resultMeta) => error ? reject(error) : resolve({ css, map: resultMap, meta: resultMeta }))
    loader.call({ ...context, async: () => callback } as any, source, map as any, meta)
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

describe('Webpack Web rpx 收尾的数据边界', () => {
  it('同步更新 CSS 与 PostCSS AST，并保留来源映射和其他元数据', async () => {
    vi.stubEnv('TARO_ENV', 'h5')
    const compilerOptions = createCompilerContext({ generator: { target: 'web' }, rem2rpx: false, px2rpx: true })
    const runtimeState = { tailwindRuntime: compilerOptions.tailwindRuntime }
    try {
      const resourcePath = path.resolve('input.css')
      const input = await postcss([]).process('.a{padding:16rpx}', { from: resourcePath, map: { inline: false, annotation: false } })
      const meta = { custom: { retained: true }, ast: { type: 'postcss', version: postcss().version, root: input.root } }
      const output = await invoke({
        resourcePath,
        sourceMap: true,
        getOptions: () => ({ tailwindcssImportRewrite: { pkgDir: '', compilerOptions, runtimeState } }),
      }, input.css, input.map!.toJSON(), meta)
      expect(output.css).toBe('.a{padding:0.5rem}')
      expect(output.meta.ast.root.toString()).toBe(output.css)
      expect(output.meta.ast.root).not.toBe(meta.ast.root)
      expect(meta.ast.root.toString()).toBe('.a{padding:16rpx}')
      expect(output.meta.custom).toBe(meta.custom)
      expect(output.map?.sources).toEqual(['input.css'])
      expect(output.map?.sourcesContent).toEqual(['.a{padding:16rpx}'])
    }
    finally {
      await disposeCompilerOwner(runtimeState)
    }
  })

  it('无转换时保持 Buffer、map 与 meta 的身份', async () => {
    const source = Buffer.from('.a{padding:1rem}')
    const map = { version: 3, sources: [], names: [], mappings: '' }
    const meta = { custom: true }
    const result = await invoke({ getOptions: () => ({}) }, source, map, meta)
    expect(result.css).toBe(source)
    expect(result.map).toBe(map)
    expect(result.meta).toBe(meta)
  })

  it('已释放会话通过异步 callback 拒绝，不能复活或借用其他会话', async () => {
    const compiler = {}
    const key = 'closed-web-rpx-finalizer'
    setWebpackLoaderRuntime(key, {}, compiler)
    deleteWebpackLoaderRuntime(key, compiler)
    await expect(invoke({ _compiler: compiler, getOptions: () => ({ tailwindcssImportRewriteRuntimeKey: key }) }, '.a{padding:16rpx}')).rejects.toThrow('已释放')
  })
})

describe('Webpack Web 收尾 loader 的执行顺序', () => {
  it.each([
    ['/workspace/postcss-loader/index.js', '/workspace/finalize.cjs'],
    ['C:\\workspace\\postcss-loader\\index.js', 'C:\\workspace\\finalize.cjs'],
    ['postcss-loader/index.js', 'finalize.cjs'],
  ])('在最左 PostCSS 之后执行且不重复注入：%s', (postcssLoader, finalizer) => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    const entries = ['css-loader/index.js', postcssLoader, postcssLoader, 'sass-loader/index.js'].map(loader => ({ loader, options: {}, ident: null, type: null }))
    injectWebRpxFinalizer(entries, finalizer, 'runtime')
    injectWebRpxFinalizer(entries, finalizer, 'runtime')
    expect(entries.map(entry => entry.loader)).toEqual(['css-loader/index.js', finalizer, postcssLoader, postcssLoader, 'sass-loader/index.js'])
  })

  it('没有真实 PostCSS 时不把其他模块的框架配置当作收尾边界', () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(true)
    const entries = [{ loader: 'css-loader/index.js', options: {}, ident: null, type: null }]
    injectWebRpxFinalizer(entries, 'finalize.cjs', 'runtime')
    expect(entries).toHaveLength(1)
  })
})
