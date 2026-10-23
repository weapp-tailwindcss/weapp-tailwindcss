import type { OutputAsset, OutputChunk } from 'rollup'
import type { ViteFrameworkStyleAssetContext } from '../../shared/framework-asset-strategy'
import { AssetEmissionPlan } from '@/compiler'
import { collectUniAppXHarmonyApplyStyleSources, collectUniAppXHarmonyApplyUtilities, createUniAppXBundleAssetSourceGetter, createUniAppXHarmonyApplyGeneratorSource, injectUniAppXHarmonyBundleStyles, injectUniAppXStylePlaceholder } from '@/uni-app-x/style-asset'
import { applyViteAssetEmissionPlan } from '../../generate-bundle/asset-emission-plan'

function appendCss(baseCss: string, css: string) {
  if (baseCss.length === 0) {
    return css
  }
  if (css.length === 0) {
    return baseCss
  }
  return `${baseCss}\n${css}`
}

function injectHarmonyCssIntoMainAsset(
  bundle: Record<string, OutputAsset | OutputChunk>,
  cssSources: string[],
  isMainCssAsset: (file: string) => boolean,
  plan: AssetEmissionPlan,
  writeTargets: Map<string, OutputAsset>,
  onUpdate: ViteFrameworkStyleAssetContext['onUpdate'],
  debug: ViteFrameworkStyleAssetContext['debug'],
) {
  let mainEntry: [string, OutputAsset] | undefined
  for (const [bundleFile, output] of Object.entries(bundle)) {
    if (output.type !== 'asset') {
      continue
    }
    const file = isMainCssAsset(bundleFile)
      ? bundleFile
      : output.fileName && isMainCssAsset(output.fileName)
        ? output.fileName
        : undefined
    if (file) {
      mainEntry = [file, output]
      break
    }
  }
  if (!mainEntry || cssSources.length === 0) {
    return false
  }
  const [file, output] = mainEntry
  const currentSource = String(output.source)
  let nextSource = currentSource
  for (const css of cssSources) {
    const trimmedCss = css.trim()
    if (trimmedCss.length === 0 || nextSource.includes(trimmedCss)) {
      continue
    }
    nextSource = appendCss(nextSource, trimmedCss)
  }
  if (nextSource === currentSource) {
    return false
  }
  plan.write(file, nextSource)
  writeTargets.set(file, output)
  onUpdate(file, currentSource, nextSource)
  debug('uni-app-x harmony main css inject')
  return true
}

interface HandleUniAppXPostCssOptions extends ViteFrameworkStyleAssetContext {
  enabled: boolean
  deferStylePlaceholderInjection?: boolean
}

export async function createHarmonyBundleStyleSources(context: ViteFrameworkStyleAssetContext) {
  const cssSources = context.getProcessedCssSources()
  const applyUtilities = collectUniAppXHarmonyApplyUtilities(context.bundle)
  const applyStyleSources = collectUniAppXHarmonyApplyStyleSources(context.bundle)
  if (applyUtilities.size > 0 && applyStyleSources.length > 0) {
    const css = await context.generateCss(
      createUniAppXHarmonyApplyGeneratorSource(applyStyleSources, applyUtilities),
      'uni-app-x-harmony-apply.css',
    )
    if (css) {
      cssSources.push(css)
    }
  }
  return cssSources
}

export async function handleUniAppXPostCssTasks(options: HandleUniAppXPostCssOptions) {
  const {
    bundle,
    debug,
    getCssHandlerOptions,
    isHarmonyAppStyleTarget,
    isNativeAppStyleTarget,
    onUpdate,
    deferStylePlaceholderInjection,
  } = options
  const applyStyleSources = collectUniAppXHarmonyApplyStyleSources(bundle)
  if (!options.enabled && !isNativeAppStyleTarget && !isHarmonyAppStyleTarget) {
    return applyStyleSources
  }

  const emissionPlan = new AssetEmissionPlan()
  const writeTargets = new Map<string, OutputAsset>()
  const applyEmissionPlan = () => {
    applyViteAssetEmissionPlan(emissionPlan, {
      bundle,
      writeTargets,
    })
    emissionPlan.clear()
    writeTargets.clear()
  }
  const getAssetSource = createUniAppXBundleAssetSourceGetter(bundle)
  const viteProcessedCssSources = isHarmonyAppStyleTarget
    ? await createHarmonyBundleStyleSources(options)
    : options.getProcessedCssSources()
  if (isHarmonyAppStyleTarget && injectUniAppXHarmonyBundleStyles(bundle, { cssSources: viteProcessedCssSources })) {
    debug('uni-app-x harmony bundle styles inject')
  }
  if (isHarmonyAppStyleTarget) {
    injectHarmonyCssIntoMainAsset(
      bundle,
      viteProcessedCssSources,
      file => getCssHandlerOptions(file).isMainChunk === true,
      emissionPlan,
      writeTargets,
      onUpdate,
      debug,
    )
    applyEmissionPlan()
  }
  if (deferStylePlaceholderInjection) {
    return applyStyleSources
  }
  for (const [bundleFile, item] of Object.entries(bundle)) {
    if (item.type !== 'asset') {
      continue
    }
    const file = bundleFile.endsWith('.uvue.ts')
      ? bundleFile
      : item.fileName || bundleFile
    if (!file.endsWith('.uvue.ts')) {
      continue
    }
    const currentSource = String(item.source)
    const nextSource = injectUniAppXStylePlaceholder(
      file,
      currentSource,
      getAssetSource,
      viteProcessedCssSources,
    )
    if (nextSource !== currentSource) {
      emissionPlan.write(file, nextSource)
      writeTargets.set(file, item)
      applyEmissionPlan()
      onUpdate(file, currentSource, nextSource)
      debug('uni-app-x style placeholder inject: %s', file)
    }
  }
  return applyStyleSources
}
