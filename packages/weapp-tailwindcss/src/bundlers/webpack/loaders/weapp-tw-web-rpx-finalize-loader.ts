import type webpack from 'webpack'
import type { WebpackCssImportRewriteLoaderOptions } from './runtime-registry'
import { Buffer } from 'node:buffer'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { useWebRpxCompatibility } from '@/compiler/style-capabilities'
import { resolveCompilationProfile } from '@/context/compilation-profile'
import { resolveGeneratorStyleOptions } from '@/generation/generation-helpers'
import { createWebRpxFinalizerPlugin } from '@/generation/web-rpx-finalizer'
import { resolveWebpackCssPipelineLoaderOptions } from './weapp-tw-css-import-rewrite-loader'

/** 真实框架 loader 运行后仅兜底剩余 rpx，不重复显式单位规则。 */
const WebRpxFinalizeLoader: webpack.LoaderDefinitionFunction<WebpackCssImportRewriteLoaderOptions> = function (source: string | Buffer, sourceMap, meta) {
  const callback = this.async()
  void Promise.resolve().then(async () => {
    const options = resolveWebpackCssPipelineLoaderOptions(this.getOptions(), this._compiler)?.tailwindcssImportRewrite
    const execute = async () => {
      if (!options?.compilerOptions || !options.runtimeState) {
        return { source, sourceMap, meta }
      }
      const { profile } = resolveCompilationProfile(options.compilerOptions, options.runtimeState)
      const styles = resolveGeneratorStyleOptions(profile, {}, profile.generator.styleOptions)
      const input = Buffer.isBuffer(source) ? source.toString('utf8') : source
      if (profile.generator.target !== 'web' || !useWebRpxCompatibility(styles) || !/rpx/i.test(input)) {
        return { source, sourceMap, meta }
      }
      const result = await postcss([createWebRpxFinalizerPlugin()]).process(input, {
        from: this.resourcePath,
        map: sourceMap || this.sourceMap ? { prev: sourceMap, inline: false, annotation: false } : false,
      })
      if (result.css === input) {
        return { source, sourceMap, meta }
      }
      // css-loader 优先消费 PostCSS AST，必须与已转换的字符串保持同一版本。
      const updatedMeta = meta?.ast?.type === 'postcss'
        ? { ...meta, ast: { ...meta.ast, root: result.root } }
        : meta
      return { source: result.css, sourceMap: result.map?.toJSON(), meta: updatedMeta }
    }
    return options?.run ? options.run(execute) : execute()
  }).then(result => callback(null, result.source, result.sourceMap, result.meta), error => callback(error))
}

export default WebRpxFinalizeLoader
