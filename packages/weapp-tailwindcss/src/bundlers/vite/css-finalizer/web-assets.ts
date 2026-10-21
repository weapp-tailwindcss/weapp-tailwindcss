import type { OutputAsset, OutputBundle } from 'rollup'
import type { CssFinalizerContext } from './options'
import { finalizeWebCssPropertyFallbacks } from '@weapp-tailwindcss/postcss/transform'
import { AssetEmissionPlan } from '@/compiler'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { applyViteAssetEmissionPlan } from '../generate-bundle/asset-emission-plan'
import { finalizeWebCssCalc } from './css-calc'
import { inferPlatformFromViteOutDir } from './options'

interface FinalizedAsset {
  asset: OutputAsset
  original: string
  final: string
}

const previousAssets = new WeakMap<CssFinalizerContext, Map<string, FinalizedAsset>>()

function sourceOf(asset: OutputAsset) {
  return typeof asset.source === 'string' ? asset.source : new TextDecoder().decode(asset.source)
}

/** 收集、重放和注入全部完成后，统一分析注册并收尾 Web 资产。 */
export async function finalizeWebCssAssets(bundle: OutputBundle, context: CssFinalizerContext) {
  const opts = context.opts
  const generator = normalizeWeappTailwindcssGeneratorOptions(opts.generator, {
    appType: opts.appType,
    platform: opts.cssOptions?.platform ?? opts.platform
      ?? inferPlatformFromViteOutDir(context.getResolvedConfig()?.build?.outDir),
    tailwindcssMajorVersion: context.runtimeState.tailwindRuntime.majorVersion,
    uniAppX: opts.uniAppX,
  })
  const assets = Object.entries(bundle).flatMap(([key, asset]) => {
    const file = asset.fileName || key
    return asset.type === 'asset' && opts.cssMatcher(file) && !opts.htmlMatcher(file)
      ? [{ asset, file }]
      : []
  })
  const previous = previousAssets.get(context)
  const originals = assets.map(({ asset, file }) => {
    const prior = previous?.get(file)
    const source = sourceOf(asset)
    return prior?.asset === asset && source === prior.final ? prior.original : source
  })
  const finalized = finalizeWebCssPropertyFallbacks(originals, generator.webCompat)
  const plan = new AssetEmissionPlan()
  const writeTargets = new Map<string, OutputAsset>()
  for (const [index, { asset, file }] of assets.entries()) {
    const css = finalized[index]!
    const source = sourceOf(asset)
    if (css !== source) {
      plan.write(file, css)
      writeTargets.set(file, asset)
      opts.onUpdate(file, source, css)
    }
  }
  applyViteAssetEmissionPlan(plan, { bundle, writeTargets })
  await finalizeWebCssCalc(bundle, context)
  previousAssets.set(context, new Map(assets.map(({ asset, file }, index) => [file, {
    asset,
    original: originals[index]!,
    final: sourceOf(asset),
  }])))
}
