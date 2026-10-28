import type { Compiler } from 'webpack'
import { Buffer } from 'node:buffer'
import postcss from 'postcss'
import unitConverter from 'postcss-rule-unit-converter'

const pluginName = 'TaroWebRpxToRemPlugin'

export class WebRpxToRemPlugin {
  constructor(private readonly baseFontSize: number) {}

  apply(compiler: Compiler) {
    const { Compilation, sources } = compiler.webpack
    compiler.hooks.compilation.tap(pluginName, (compilation) => {
      compilation.hooks.processAssets.tapPromise({
        name: pluginName,
        // 5.6.3 在 SUMMARIZE 生成 CSS；必须在其完成之后、内容哈希之前转换。
        stage: Compilation.PROCESS_ASSETS_STAGE_SUMMARIZE + 1,
      }, async () => {
        for (const asset of compilation.getAssets()) {
          if (!/\.css$/i.test(asset.name)) {
            continue
          }
          const { source, map } = asset.source.sourceAndMap()
          const css = source.toString()
          const annotation = /\/\*[#@]\s*sourceMappingURL=([^\s*]+)\s*\*\//.exec(css)?.[1]
          const inlineMap = annotation?.startsWith('data:application/json') ? annotation : undefined
          const relatedMapName = asset.info.related?.sourceMap
          const relatedMap = typeof relatedMapName === 'string' ? compilation.getAsset(relatedMapName) : undefined
          // DEV_TOOLING 早于 SUMMARIZE：只从资产图或内联 data URL 恢复已经导出的映射。
          const previousMap = map ?? (relatedMap
            ? JSON.parse(relatedMap.source.source().toString())
            : inlineMap
              ? JSON.parse(inlineMap.includes(';base64,')
                  ? Buffer.from(inlineMap.slice(inlineMap.indexOf(',') + 1), 'base64').toString('utf8')
                  : decodeURIComponent(inlineMap.slice(inlineMap.indexOf(',') + 1)))
              : undefined)
          let converted = false
          const result = await postcss([unitConverter({
            rules: [{
              from: 'rpx',
              to: 'rem',
              transform: (value) => {
                converted = true
                return value / (this.baseFontSize * 2)
              },
            }],
            mediaQuery: true,
          })]).process(css, {
            from: asset.name,
            to: asset.name,
            map: previousMap
              ? { prev: previousMap, inline: Boolean(inlineMap), annotation: inlineMap ? undefined : annotation ?? false }
              : false,
          })
          if (!converted || result.css === css) {
            continue
          }
          if (!previousMap && annotation) {
            throw new Error(`Cannot transform ${asset.name}: its source map is unavailable in the compilation assets`)
          }
          // PostCSS 已将单位变化映射与原映射合成，不能直接把原 map 挂到新 CSS。
          const nextSource = result.map
            ? new sources.SourceMapSource(result.css, asset.name, result.map.toJSON())
            : new sources.RawSource(result.css)
          compilation.updateAsset(asset.name, nextSource)
          if (relatedMap && result.map) {
            compilation.updateAsset(relatedMap.name, new sources.RawSource(result.map.toString()))
          }
        }
      })
    })
  }
}
