import type { OutputBundle } from 'rollup'
import type { GenerateBundleContext } from '../generate-bundle/types'
import type { ViteFrameworkStyleAssetContext } from './framework-asset-strategy'
import { generateTailwindV4Css } from '@/context/generation'
import { annotateCssSourceTrace, createCssTokenSourceMap } from '../../shared/css-source-trace'
import { createFrameworkAssetAccess } from './framework-assets'

interface FrameworkStyleAssetOptions extends Omit<ViteFrameworkStyleAssetContext, 'generateCss' | 'getProcessedCssSources' | 'assets'> {
  bundle: OutputBundle
  opts: GenerateBundleContext['opts']
  runtimeState: GenerateBundleContext['runtimeState']
  getSourceCandidatesForEntries: GenerateBundleContext['getSourceCandidatesForEntries']
  getSourceCandidateSourcesForEntries: GenerateBundleContext['getSourceCandidateSourcesForEntries']
  getViteProcessedCssAssetResults: GenerateBundleContext['getViteProcessedCssAssetResults']
  generatorPlatform?: string | undefined
}

/** 将共享生成状态封装为当前产物阶段可用的操作。 */
export function createFrameworkStyleAssetContext(options: FrameworkStyleAssetOptions): ViteFrameworkStyleAssetContext {
  return {
    assets: createFrameworkAssetAccess(options.bundle),
    debug: options.debug,
    getCssHandlerOptions: options.getCssHandlerOptions,
    getProcessedCssSources: () => [...(options.getViteProcessedCssAssetResults?.() ?? [])]
      .map(([, record]) => typeof record === 'string' ? record : record.css),
    isHarmonyAppStyleTarget: options.isHarmonyAppStyleTarget,
    isNativeAppStyleTarget: options.isNativeAppStyleTarget,
    onUpdate: options.onUpdate,
    async generateCss(source, outputFile) {
      const cssHandlerOptions = options.getCssHandlerOptions(outputFile)
      const generated = await generateTailwindV4Css({
        deferWebCssPropertyFallback: true,
        opts: options.opts,
        runtimeState: options.runtimeState,
        runtime: new Set(),
        rawSource: source,
        file: outputFile,
        outputFile,
        cssHandlerOptions,
        cssUserHandlerOptions: { ...cssHandlerOptions, isMainChunk: false },
        cssStage: 'framework-processed',
        disableSourceScan: true,
        getSourceCandidatesForEntries: options.getSourceCandidatesForEntries,
        generatorPlatform: options.generatorPlatform,
        styleHandler: options.opts.styleHandler,
        debug: options.debug,
      })
      return generated?.css
        ? annotateCssSourceTrace(generated.css, {
            opts: options.opts,
            tokenSources: options.getSourceCandidateSourcesForEntries
              ? createCssTokenSourceMap(options.getSourceCandidateSourcesForEntries(undefined), options.opts)
              : undefined,
          })
        : undefined
    },
  }
}
