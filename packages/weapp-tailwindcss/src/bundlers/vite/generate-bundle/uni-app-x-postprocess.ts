import type { OutputAsset, OutputChunk } from 'rollup'
import type { CssHandlerOptionsCache } from '../css-handler-options'
import type { GenerateBundleContext } from './types'
import { AssetEmissionPlan } from '@/compiler'
import { collectUniAppXHarmonyApplyStyleSources, collectUniAppXHarmonyApplyUtilities, createUniAppXBundleAssetSourceGetter, createUniAppXHarmonyApplyGeneratorSource, injectUniAppXHarmonyBundleStyles, injectUniAppXStylePlaceholder } from '@/uni-app-x/style-asset'
import { generateTailwindV4Css } from '../../../generation/service'
import { annotateCssSourceTrace, createCssTokenSourceMap } from '../../shared/css-source-trace'
import { applyViteAssetEmissionPlan } from './asset-emission-plan'

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
  onUpdate: GenerateBundleContext['opts']['onUpdate'],
  debug: GenerateBundleContext['debug'],
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

interface HandleUniAppXPostCssOptions {
  bundle: Record<string, OutputAsset | OutputChunk>
  debug: GenerateBundleContext['debug']
  generatorRuntime: Set<string>
  getCssHandlerOptions: CssHandlerOptionsCache['getCssHandlerOptions']
  getSourceCandidateSourcesForEntries: GenerateBundleContext['getSourceCandidateSourcesForEntries']
  getSourceCandidatesForEntries: GenerateBundleContext['getSourceCandidatesForEntries']
  getViteProcessedCssAssetResults: GenerateBundleContext['getViteProcessedCssAssetResults']
  isHarmonyAppStyleTarget: boolean
  isNativeAppStyleTarget: boolean
  onUpdate: GenerateBundleContext['opts']['onUpdate']
  opts: GenerateBundleContext['opts']
  runtimeState: GenerateBundleContext['runtimeState']
  styleHandler: GenerateBundleContext['opts']['styleHandler']
  deferStylePlaceholderInjection?: boolean
}

export async function handleUniAppXPostCssTasks(options: HandleUniAppXPostCssOptions) {
  const {
    bundle,
    debug,
    getCssHandlerOptions,
    getSourceCandidateSourcesForEntries,
    getSourceCandidatesForEntries,
    getViteProcessedCssAssetResults,
    isHarmonyAppStyleTarget,
    isNativeAppStyleTarget,
    onUpdate,
    opts,
    runtimeState,
    styleHandler,
    deferStylePlaceholderInjection,
  } = options
  const applyStyleSources = collectUniAppXHarmonyApplyStyleSources(bundle)
  if (opts.appType !== 'uni-app-x' && !isNativeAppStyleTarget && !isHarmonyAppStyleTarget) {
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
  const viteProcessedCssSources = [...(getViteProcessedCssAssetResults?.() ?? [])]
    .map(([, record]) => typeof record === 'string' ? record : record.css)
  const applyUtilities = collectUniAppXHarmonyApplyUtilities(bundle)
  if (isHarmonyAppStyleTarget && applyUtilities.size > 0 && applyStyleSources.length > 0) {
    const outputFile = 'uni-app-x-harmony-apply.css'
    const cssHandlerOptions = getCssHandlerOptions(outputFile)
    const generated = await generateTailwindV4Css({
      opts,
      runtimeState,
      runtime: new Set(),
      rawSource: createUniAppXHarmonyApplyGeneratorSource(applyStyleSources, applyUtilities),
      file: outputFile,
      outputFile,
      cssHandlerOptions,
      cssUserHandlerOptions: {
        ...cssHandlerOptions,
        isMainChunk: false,
      },
      cssStage: 'framework-processed',
      disableSourceScan: true,
      getSourceCandidatesForEntries,
      styleHandler,
      debug,
    })
    if (generated?.css) {
      viteProcessedCssSources.push(annotateCssSourceTrace(generated.css, {
        opts,
        tokenSources: getSourceCandidateSourcesForEntries
          ? createCssTokenSourceMap(getSourceCandidateSourcesForEntries(undefined), opts)
          : undefined,
      }))
    }
  }
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
