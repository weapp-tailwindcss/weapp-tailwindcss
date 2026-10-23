import type { ViteFrameworkStyleAssetContext } from '../../shared/framework-asset-strategy'
import type { FrameworkAssets } from '../../shared/framework-assets'
import { collectUniAppXHarmonyApplyStyleSources, collectUniAppXHarmonyApplyUtilities, createUniAppXBundleAssetSourceGetter, createUniAppXHarmonyApplyGeneratorSource, injectUniAppXHarmonyBundleStyles, injectUniAppXStylePlaceholder } from '@/uni-app-x/style-asset'

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
  bundle: FrameworkAssets,
  cssSources: string[],
  isMainCssAsset: (file: string) => boolean,
  assets: ViteFrameworkStyleAssetContext['assets'],
  onUpdate: ViteFrameworkStyleAssetContext['onUpdate'],
  debug: ViteFrameworkStyleAssetContext['debug'],
) {
  let mainEntry: [string, Extract<FrameworkAssets[string], { type: 'asset' }>] | undefined
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
      mainEntry = [bundleFile, output]
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
  assets.replaceText(file, nextSource)
  onUpdate(output.fileName || file, currentSource, nextSource)
  debug('uni-app-x harmony main css inject')
  return true
}

interface HandleUniAppXPostCssOptions extends ViteFrameworkStyleAssetContext {
  enabled: boolean
  deferStylePlaceholderInjection?: boolean
}

export async function createHarmonyBundleStyleSources(context: ViteFrameworkStyleAssetContext) {
  const cssSources = context.getProcessedCssSources()
  const applyUtilities = collectUniAppXHarmonyApplyUtilities(context.assets.read())
  const applyStyleSources = collectUniAppXHarmonyApplyStyleSources(context.assets.read())
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
    assets,
    debug,
    matchesMainCss,
    isHarmonyAppStyleTarget,
    isNativeAppStyleTarget,
    onUpdate,
    deferStylePlaceholderInjection,
  } = options
  const bundle = assets.read()
  const applyStyleSources = collectUniAppXHarmonyApplyStyleSources(bundle)
  if (!options.enabled && !isNativeAppStyleTarget && !isHarmonyAppStyleTarget) {
    return applyStyleSources
  }

  const getAssetSource = createUniAppXBundleAssetSourceGetter(bundle)
  const viteProcessedCssSources = isHarmonyAppStyleTarget
    ? await createHarmonyBundleStyleSources(options)
    : options.getProcessedCssSources()
  if (isHarmonyAppStyleTarget && applyHarmonyBundleStyles(options, viteProcessedCssSources)) {
    debug('uni-app-x harmony bundle styles inject')
  }
  if (isHarmonyAppStyleTarget) {
    injectHarmonyCssIntoMainAsset(
      bundle,
      viteProcessedCssSources,
      matchesMainCss,
      assets,
      onUpdate,
      debug,
    )
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
      assets.replaceText(bundleFile, nextSource)
      onUpdate(file, currentSource, nextSource)
      debug('uni-app-x style placeholder inject: %s', file)
    }
  }
  return applyStyleSources
}

/** 框架在私有副本上计算变更，实际产物由构建器操作提交。 */
export function applyHarmonyBundleStyles(context: ViteFrameworkStyleAssetContext, cssSources: string[]) {
  const snapshot = context.assets.read()
  const working = Object.fromEntries(Object.entries(snapshot).map(([file, item]) => [file, { ...item }]))
  const changed = injectUniAppXHarmonyBundleStyles(working, { cssSources })
  if (changed) {
    for (const [file, item] of Object.entries(working)) {
      if (item.type === 'chunk' && item.code !== (snapshot[file] as typeof item).code) {
        context.assets.replaceText(file, item.code)
      }
    }
  }
  return changed
}
