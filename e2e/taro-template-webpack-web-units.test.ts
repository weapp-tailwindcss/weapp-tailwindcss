import { Buffer } from 'node:buffer'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { loadTemplate } from './taro-template-web-target/template-config'
import { closeWebpackCompiler, createWebpackCssCompilation } from './taro-template-web-target/webpack-css-stages'

const require = createRequire(import.meta.url)
const { SourceMapConsumer } = createRequire(require.resolve('postcss/package.json'))('source-map-js')
const webpackRequire = process.env.E2E_TARO_TEMPLATE_PUBLISHED === '1'
  ? createRequire(path.resolve(__dirname, '../templates/taro-webpack-tailwindcss-v4/package.json'))
  : createRequire(path.resolve(__dirname, '../package.json'))
const webpack = webpackRequire('webpack') as typeof import('webpack')

describe('Taro Webpack 模板的生成后单位资产阶段', () => {
  it('使用当前验证项目声明的 Webpack 版本', () => {
    expect(webpack.version).toBe(webpackRequire('./package.json').devDependencies.webpack)
  })

  it.each(['h5', 'harmony-hybrid'])('%s 在生成之后、哈希之前处理作者和生成 CSS', async (target) => {
    const { config, options, webpackPlugins } = await loadTemplate('taro-webpack-tailwindcss-v4', target)
    expect(config.h5.postcss).not.toHaveProperty('postcss-rule-unit-converter')
    expect(options[0]?.rem2rpx).toBe(false)
    expect(options[0]?.cssOptions?.rem2rpx).toBe(false)
    expect(options[0]?.cssOptions?.unitConversion).toBeUndefined()
    expect(webpackPlugins).toHaveLength(1)
    const { compiler, compilation } = createWebpackCssCompilation(webpack, webpackPlugins, { devtool: 'source-map' })
    const authorName = 'nested/custom-entry.ABC.css'
    const generatedName = 'chunks/late-generated.DEF.css'
    const untouched = new webpack.sources.RawSource('.p-\\[40rpx\\]{padding:1rem}')
    const script = new webpack.sources.RawSource('const name = "40rpx"')
    try {
      // 原映射的列位置在单位长度变化之后，用于验证新 map 确实经过合成。
      const source = '.author { padding: 40rpx; color: red }'
      const mapped = await postcss([{
        postcssPlugin: 'OriginalSourceMapping',
        Once(root) {
          expect(root.nodes).toHaveLength(1)
        },
      }]).process(source, { from: 'author-input.css', to: authorName, map: { inline: false, annotation: false } })
      compilation.emitAsset(authorName, new webpack.sources.SourceMapSource(mapped.css, authorName, mapped.map!.toJSON()), { immutable: true, related: { license: 'author.LICENSE.txt' } })
      compilation.emitAsset('unchanged.css', untouched)
      compilation.emitAsset('entry.js', script)
      let sawGeneratedRpx = false
      compilation.hooks.processAssets.tap({ name: 'LateGenerator', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE }, () => {
        compilation.emitAsset(generatedName, new webpack.sources.RawSource('.generated{margin:8rpx;padding:1rem}@media(min-width:64rpx){.generated{height:10rpx}}'))
        sawGeneratedRpx = compilation.getAsset(generatedName)!.source.source().toString().includes('8rpx')
      })
      let cssAtHash = ''
      compilation.hooks.processAssets.tap({ name: 'HashObservation', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH }, () => {
        cssAtHash = compilation.getAsset(generatedName)!.source.source().toString()
      })
      await compilation.hooks.processAssets.promise(compilation.assets)
      expect(sawGeneratedRpx).toBe(true)
      expect(cssAtHash).toBe('.generated{margin:0.25rem;padding:1rem}@media(min-width:2rem){.generated{height:0.3125rem}}')
      const author = compilation.getAsset(authorName)!
      expect(author.source.source().toString()).toContain('.author { padding: 1.25rem; color: red }')
      expect(author.info).toMatchObject({ immutable: true, related: { license: 'author.LICENSE.txt' } })
      const emittedMap = compilation.getAsset(author.info.related!.sourceMap as string)!
      const map = new SourceMapConsumer(JSON.parse(emittedMap.source.source().toString()))
      const column = author.source.source().toString().indexOf('color')
      const original = map.originalPositionFor({ line: 1, column })
      expect(original.source).toMatch(/author-input\.css$/)
      expect(original.line).toBe(1)
      expect(original.column).toBe(source.indexOf('color'))
      expect(author.source.map()).toBeNull()
      expect(compilation.getAsset('unchanged.css')!.source).toBe(untouched)
      expect(compilation.getAsset('entry.js')!.source).toBe(script)
      // 同一插件实例处理下一轮已转换资产时，没有第二次缩放或多余资产更新。
      const second = compiler.newCompilation(compiler.newCompilationParams())
      for (const asset of compilation.getAssets()) {
        second.emitAsset(asset.name, asset.source, asset.info)
      }
      const observed: { source?: typeof author.source, css?: string, updates: string[] } = { updates: [] }
      const updateAsset = second.updateAsset.bind(second)
      second.updateAsset = (...args) => {
        if (observed.source) {
          observed.updates.push(args[0])
        }
        updateAsset(...args)
      }
      second.hooks.processAssets.tap({ name: 'BeforeUnitConversion', stage: webpack.Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE }, () => {
        observed.source = second.getAsset(authorName)!.source
        observed.css = observed.source.source().toString()
      })
      await second.hooks.processAssets.promise(second.assets)
      const secondAuthor = second.getAsset(authorName)!
      const secondCss = secondAuthor.source.source().toString()
      expect(secondAuthor.source).toBe(observed.source)
      expect(observed.updates).toEqual([])
      expect(secondCss).toBe(observed.css)
      expect(secondCss).toContain('padding: 1.25rem; color: red')
      // 已导出的映射不重新暴露为内部 map，第二轮 DEV_TOOLING 不能再追加同一注释。
      const annotations = Array.from(secondCss.matchAll(/\/\*[#@]\s*sourceMappingURL=([^\s*]+)\s*\*\//g), match => match[1])
      expect(annotations).toHaveLength(1)
      expect(new Set(annotations)).toEqual(new Set(Array.from(author.source.source().toString().matchAll(/\/\*[#@]\s*sourceMappingURL=([^\s*]+)\s*\*\//g), match => match[1])))
      const secondMap = second.getAsset(secondAuthor.info.related!.sourceMap as string)!
      const secondOriginal = new SourceMapConsumer(JSON.parse(secondMap.source.source().toString())).originalPositionFor({ line: 1, column: secondCss.indexOf('color') })
      expect(secondOriginal).toMatchObject({ source: original.source, line: original.line, column: original.column })
    }
    finally {
      await closeWebpackCompiler(compiler)
    }
  })

  it('内联 source map 在单位长度变化后仍指向原始声明', async () => {
    const { webpackPlugins } = await loadTemplate('taro-webpack-tailwindcss-v4', 'h5')
    const { compiler, compilation } = createWebpackCssCompilation(webpack, webpackPlugins, { devtool: 'inline-source-map' })
    try {
      const source = '.inline { padding: 40rpx; color: red }'
      const mapped = await postcss([{
        postcssPlugin: 'OriginalSourceMapping',
        Once(root) {
          expect(root.nodes).toHaveLength(1)
        },
      }]).process(source, { from: 'inline-input.css', to: 'inline.css', map: { inline: false, annotation: false } })
      compilation.emitAsset('inline.css', new webpack.sources.SourceMapSource(mapped.css, 'inline.css', mapped.map!.toJSON()))
      await compilation.hooks.processAssets.promise(compilation.assets)
      const css = compilation.getAsset('inline.css')!.source.source().toString()
      expect(css).toContain('padding: 1.25rem; color: red')
      expect(css.match(/sourceMappingURL=/g)).toHaveLength(1)
      const encodedMap = css.match(/sourceMappingURL=data:application\/json[^,]*,([^\s*]+)/)![1]!
      const original = new SourceMapConsumer(JSON.parse(Buffer.from(encodedMap, 'base64').toString('utf8'))).originalPositionFor({ line: 1, column: css.indexOf('color') })
      expect(original.source).toMatch(/inline-input\.css$/)
      expect(original.column).toBe(source.indexOf('color'))
      expect(compilation.getAsset('inline.css')!.source.map()).toBeNull()
      const second = compiler.newCompilation(compiler.newCompilationParams())
      for (const asset of compilation.getAssets()) {
        second.emitAsset(asset.name, asset.source, asset.info)
      }
      await second.hooks.processAssets.promise(second.assets)
      expect(second.getAsset('inline.css')!.source.source().toString()).toBe(css)
      expect(second.getAsset('inline.css')!.source.source().toString().match(/sourceMappingURL=/g)).toHaveLength(1)
    }
    finally {
      await closeWebpackCompiler(compiler)
    }
  })

  it('尚未导出的内部 map 保留转换后的映射', async () => {
    const { webpackPlugins } = await loadTemplate('taro-webpack-tailwindcss-v4', 'h5')
    const { compiler, compilation } = createWebpackCssCompilation(webpack, webpackPlugins)
    try {
      const source = '.internal { padding: 40rpx; color: red }'
      const mapped = await postcss([{
        postcssPlugin: 'OriginalSourceMapping',
        Once(root) {
          expect(root.nodes).toHaveLength(1)
        },
      }]).process(source, { from: 'internal-input.css', to: 'internal.css', map: { inline: false, annotation: false } })
      compilation.emitAsset('internal.css', new webpack.sources.SourceMapSource(mapped.css, 'internal.css', mapped.map!.toJSON()))
      await compilation.hooks.processAssets.promise(compilation.assets)
      const asset = compilation.getAsset('internal.css')!
      const css = asset.source.source().toString()
      const original = new SourceMapConsumer(asset.source.map()!).originalPositionFor({ line: 1, column: css.indexOf('color') })
      expect(css).toBe('.internal { padding: 1.25rem; color: red }')
      expect(original.source).toMatch(/internal-input\.css$/)
      expect(original.column).toBe(source.indexOf('color'))
    }
    finally {
      await closeWebpackCompiler(compiler)
    }
  })

  it('CSS 解析失败向 Webpack 传播并保留失败资产', async () => {
    const { webpackPlugins } = await loadTemplate('taro-webpack-tailwindcss-v4', 'h5')
    const { compiler, compilation } = createWebpackCssCompilation(webpack, webpackPlugins)
    const invalid = new webpack.sources.RawSource('.broken { padding: 40rpx;')
    try {
      compilation.emitAsset('broken.css', invalid)
      await expect(compilation.hooks.processAssets.promise(compilation.assets)).rejects.toThrow(/Unclosed block/)
      expect(compilation.getAsset('broken.css')!.source).toBe(invalid)
    }
    finally {
      await closeWebpackCompiler(compiler)
    }
  })

  it('缺少关联映射时拒绝输出挂有旧 map 的已改 CSS', async () => {
    const { webpackPlugins } = await loadTemplate('taro-webpack-tailwindcss-v4', 'h5')
    const { compiler, compilation } = createWebpackCssCompilation(webpack, webpackPlugins)
    const original = new webpack.sources.RawSource('.mapped{padding:40rpx}/*# sourceMappingURL=missing.css.map */')
    try {
      compilation.emitAsset('mapped.css', original, { related: { sourceMap: 'missing.css.map' } })
      await expect(compilation.hooks.processAssets.promise(compilation.assets)).rejects.toThrow(/source map is unavailable/)
      expect(compilation.getAsset('mapped.css')!.source).toBe(original)
    }
    finally {
      await closeWebpackCompiler(compiler)
    }
  })

  it('内存 map 不能替代 CSS 注释指向的外部资产', async () => {
    const { webpackPlugins } = await loadTemplate('taro-webpack-tailwindcss-v4', 'h5')
    const { compiler, compilation } = createWebpackCssCompilation(webpack, webpackPlugins)
    try {
      const mapped = await postcss([{
        postcssPlugin: 'OriginalSourceMapping',
        Once(root) {
          expect(root.nodes).toHaveLength(1)
        },
      }]).process('.mapped{padding:40rpx}', { from: 'original.css', to: 'mapped.css', map: { inline: false, annotation: false } })
      const original = new webpack.sources.SourceMapSource(`${mapped.css}/*# sourceMappingURL=missing.css.map */`, 'mapped.css', mapped.map!.toJSON())
      compilation.emitAsset('mapped.css', original)
      await expect(compilation.hooks.processAssets.promise(compilation.assets)).rejects.toThrow(/source map is unavailable/)
      expect(compilation.getAsset('mapped.css')!.source).toBe(original)
    }
    finally {
      await closeWebpackCompiler(compiler)
    }
  })

  it.each(['weapp', 'alipay', 'harmony', 'rn', 'jdrn'])('%s 不注册 Web 兼容转换', async (target) => {
    expect((await loadTemplate('taro-webpack-tailwindcss-v4', target)).webpackPlugins).toEqual([])
  })
})
