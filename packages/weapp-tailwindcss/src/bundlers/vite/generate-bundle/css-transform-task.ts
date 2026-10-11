import type { TailwindV4GenerationCoreInput, TailwindV4GenerationCoreResult } from '../../../generation/service'
import { stripDeferredCssSourceMarkers } from '@weapp-tailwindcss/postcss/transform'
import { hasTailwindRootDirectives } from '../../../generation/directives'
import { isPureLocalCssImportWrapper } from '../../../generation/local-imports'
import { generateTailwindV4Css } from '../../../generation/service'
import { hasBundlerGeneratedCssMarker } from '../../shared/generated-css-marker'
import { normalizeCssSourceForCompare } from '../css-output'
import { hasTailwindGenerationSource } from './sfc-style-source'
import { replaceWebCssModule } from './web-css-module'

export type ViteCssTransformTaskKind = 'tailwind' | 'web' | 'import-shell' | 'style'

export interface ViteCssTransformTaskResult {
  classSet?: Set<string> | undefined
  css: string
  dependencies: string[]
  diffSource?: string | undefined
  generatorTarget?: TailwindV4GenerationCoreResult['target'] | undefined
  kind: ViteCssTransformTaskKind
  shouldRecordCssAsset: boolean
}

export interface ExecuteViteCssTransformTaskOptions {
  annotateCss: (css: string) => string
  assetSourceFile?: string | undefined
  cssUserHandlerOptions: TailwindV4GenerationCoreInput['cssUserHandlerOptions']
  debug: TailwindV4GenerationCoreInput['debug']
  file: string
  generateCss?: typeof generateTailwindV4Css | undefined
  generatorPlatform?: string | undefined
  generatorCssHandlerOptions: TailwindV4GenerationCoreInput['cssHandlerOptions']
  generatorRawSource: string
  generatorSourceFile: string
  generatorUserLayerRawSource?: string | undefined
  getSourceCandidatesForEntries: TailwindV4GenerationCoreInput['getSourceCandidatesForEntries']
  isWebGeneratorTarget: boolean
  normalizeGeneratorUserRawSource: (
    source: string,
    sourceFile: string,
    fallbackFile?: string | undefined,
  ) => string
  normalizeMiniProgramGeneratorRawSource: (source: string, outputFile: string) => string
  opts: TailwindV4GenerationCoreInput['opts']
  outputFile: string
  previousCss?: string | undefined
  rawSource: string
  removeRootCoveredCssFromScopedAsset: (css: string) => string
  runtime: Set<string>
  runtimeState: TailwindV4GenerationCoreInput['runtimeState']
  styleHandlerOptions: TailwindV4GenerationCoreInput['cssHandlerOptions']
  styleHandler: TailwindV4GenerationCoreInput['styleHandler']
  transformWebTargetCss: (css: string) => string
  usesConfiguredTailwindV4FallbackSource: boolean
  vitePipelineCssAsset: boolean
}

function resolveBundleUserRawSource(options: ExecuteViteCssTransformTaskOptions) {
  return options.vitePipelineCssAsset
    && !hasBundlerGeneratedCssMarker(options.rawSource)
    && normalizeCssSourceForCompare(options.rawSource)
    !== normalizeCssSourceForCompare(options.generatorRawSource)
    ? options.normalizeMiniProgramGeneratorRawSource(
        options.normalizeGeneratorUserRawSource(
          options.rawSource,
          options.generatorSourceFile,
          options.assetSourceFile,
        ),
        options.outputFile,
      )
    : undefined
}

export async function executeViteCssTransformTask(
  options: ExecuteViteCssTransformTaskOptions,
): Promise<ViteCssTransformTaskResult> {
  await options.runtimeState.readyPromise
  const previousGeneratorCss = options.previousCss && !options.isWebGeneratorTarget
    ? options.normalizeMiniProgramGeneratorRawSource(options.previousCss, options.outputFile)
    : options.previousCss
  const shouldGenerateCssWithCore = (hasTailwindGenerationSource(options.generatorRawSource)
    && (!options.isWebGeneratorTarget
      || !hasBundlerGeneratedCssMarker(options.rawSource)
      || hasTailwindRootDirectives(options.generatorRawSource, { importFallback: true })))
    || (!options.isWebGeneratorTarget && hasBundlerGeneratedCssMarker(options.rawSource))

  if (shouldGenerateCssWithCore) {
    const bundleUserRawSource = resolveBundleUserRawSource(options)
    const generatorUserRawSource = [options.generatorUserLayerRawSource, options.isWebGeneratorTarget ? bundleUserRawSource : undefined]
      .filter(source => typeof source === 'string' && source.trim().length > 0)
      .join('\n')
    const generated = await (options.generateCss ?? generateTailwindV4Css)({
      cssHandlerOptions: options.generatorCssHandlerOptions,
      cssStage: 'framework-processed',
      cssUserHandlerOptions: options.cssUserHandlerOptions,
      debug: options.debug,
      file: options.generatorSourceFile,
      frameworkProcessedUserCss: options.isWebGeneratorTarget ? undefined : bundleUserRawSource,
      generatorPlatform: options.generatorPlatform,
      getSourceCandidatesForEntries: options.getSourceCandidatesForEntries,
      opts: options.opts,
      outputFile: options.outputFile,
      previousCss: previousGeneratorCss,
      rawSource: options.generatorRawSource,
      restoreLocalCssImports: options.usesConfiguredTailwindV4FallbackSource ? false : undefined,
      runtime: options.runtime,
      runtimeState: options.runtimeState,
      sourceCandidates: options.runtime,
      styleHandler: options.styleHandler,
      userRawSource: generatorUserRawSource || undefined,
    })
    if (generated) {
      const css = options.removeRootCoveredCssFromScopedAsset(
        options.annotateCss(options.transformWebTargetCss(
          options.isWebGeneratorTarget
            ? replaceWebCssModule(options.rawSource, options.generatorSourceFile, generated.css) ?? generated.css
            : generated.css,
        )),
      )
      return {
        classSet: generated.classSet,
        css: stripDeferredCssSourceMarkers(css),
        dependencies: generated.dependencies,
        diffSource: options.generatorRawSource,
        generatorTarget: generated.target,
        kind: 'tailwind',
        shouldRecordCssAsset: true,
      }
    }
  }

  if (options.isWebGeneratorTarget) {
    return {
      css: options.annotateCss(options.transformWebTargetCss(options.rawSource)),
      dependencies: [],
      kind: 'web',
      shouldRecordCssAsset: false,
    }
  }

  if (isPureLocalCssImportWrapper(options.generatorRawSource)) {
    return {
      css: options.annotateCss(options.generatorRawSource),
      dependencies: [],
      kind: 'import-shell',
      shouldRecordCssAsset: true,
    }
  }

  const { css } = await options.styleHandler(
    options.generatorRawSource,
    options.styleHandlerOptions,
  )
  return {
    css: options.annotateCss(css),
    dependencies: [],
    diffSource: options.generatorRawSource,
    kind: 'style',
    shouldRecordCssAsset: false,
  }
}
