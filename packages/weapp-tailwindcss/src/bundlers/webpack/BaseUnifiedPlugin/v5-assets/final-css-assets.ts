import type { WebCssCompatUserOptions } from '@weapp-tailwindcss/postcss/transform'
import type { Compilation, Compiler } from 'webpack'
import type { SetupWebpackV5ProcessAssetsHookOptions } from './helpers'
import { collectWebCssPropertyFallbackEdits } from '@weapp-tailwindcss/postcss/transform'
import { runCompilerOwnerExternalActivity } from '@/compiler/compiler-owner-state'
import { pluginName } from '@/constants'
import { warnFinalRpxThemeRisk } from '@/tailwindcss/v4/rpx-theme-warning'
import { getGroupedEntries } from '@/utils'
import { createWebpackAssetUpdater } from './helpers'
import { finalizeWebpackCssAssetOutputSource } from './pipeline-helpers'
import { preserveProcessedWebpackCssSource } from './processed-css-source'

interface WebCssFinalizationOptions {
  compilation: Pick<Compilation, 'getAsset'>
  cssFiles: Iterable<string>
  sources: Compiler['webpack']['sources']
  webCompat: WebCssCompatUserOptions | undefined
  updateAssetIfChanged: ReturnType<typeof createWebpackAssetUpdater>['updateAssetIfChanged']
}

/** 框架合并本地导入后、压缩与 Lynx 编码前，补齐完整消费图兼容。 */
export function finalizeProcessedWebpackCssAssets(options: WebCssFinalizationOptions) {
  const assets = [...options.cssFiles].flatMap((file) => {
    const source = options.compilation.getAsset(file)?.source
    return source ? [{ file, source }] : []
  })
  const edits = collectWebCssPropertyFallbackEdits(assets.map(({ source }) => source.source().toString()), options.webCompat)
  for (const [index, { file, source }] of assets.entries()) {
    const finalized = preserveProcessedWebpackCssSource(source, options.sources, options.webCompat, edits[index])
    if (finalized !== source) {
      options.updateAssetIfChanged(file, finalized, { compare: false })
    }
  }
}

/** 小程序在最终哈希阶段收尾；与 Web 的压缩前兼容阶段分别登记。 */
export function setupWebpackMiniCssAssetFinalizer(options: {
  compilation: Compilation
  compiler: Compiler
  compilerOptions: SetupWebpackV5ProcessAssetsHookOptions['options']
  debug: SetupWebpackV5ProcessAssetsHookOptions['debug']
  runtimeState: SetupWebpackV5ProcessAssetsHookOptions['runtimeState']
}) {
  const { compilation, compiler, compilerOptions, debug, runtimeState } = options
  compilation.hooks.processAssets.tapPromise(
    {
      name: `${pluginName}:finalize-css-assets`,
      stage: compiler.webpack.Compilation.PROCESS_ASSETS_STAGE_OPTIMIZE_HASH,
    },
    assets => runCompilerOwnerExternalActivity(runtimeState, async () => {
      const entries = Object.entries(assets)
      if (entries.length === 0) {
        return
      }
      const groupedEntries = getGroupedEntries(entries, compilerOptions)
      if (groupedEntries.css.length === 0) {
        return
      }
      const { updateAssetIfChanged } = createWebpackAssetUpdater({
        compilation,
        ConcatSource: compiler.webpack.sources.ConcatSource,
        onUpdate: compilerOptions.onUpdate,
        debug,
      })
      for (const [file, asset] of groupedEntries.css) {
        const currentAsset = compilation.getAsset(file)
        const rawSource = currentAsset?.source.source() ?? asset.source()
        const finalized = finalizeWebpackCssAssetOutputSource(rawSource.toString(), compilerOptions, false)
        updateAssetIfChanged(file, finalized)
        warnFinalRpxThemeRisk(runtimeState, [finalized], compilerOptions)
      }
    }),
  )
}
