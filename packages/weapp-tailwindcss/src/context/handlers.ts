import type { ICustomAttributesEntities, InternalUserDefinedOptions } from '@/types'
import { createStyleHandler } from '@weapp-tailwindcss/postcss/transform'
import { createJsHandler } from '@/js'
import { createTemplateHandler } from '@/wxml'
import { resolveRuntimePackageReplacements } from './runtime-package-replacements'
import { normalizeStyleHandlerMajorVersion, resolveStyleOptionsFromContext } from './style-options'

export function createHandlersFromContext(
  ctx: InternalUserDefinedOptions,
  customAttributesEntities: ICustomAttributesEntities,
  cssCalcOptions: InternalUserDefinedOptions['cssCalc'],
  tailwindcssMajorVersion?: number,
) {
  const {
    escapeMap,
    injectAdditionalCssVarScope,
    postcssOptions,
    arbitraryValues,
    jsPreserveClass,
    babelParserOptions,
    experimentalJsFastPath,
    ignoreCallExpressionIdentifiers,
    ignoreTaggedTemplateExpressionIdentifiers,
    inlineWxs,
    disabledDefaultTemplateHandler,
    replaceRuntimePackages,
  } = ctx
  const styleOptions = resolveStyleOptionsFromContext(ctx, tailwindcssMajorVersion)
  const resolvedInjectAdditionalCssVarScope = styleOptions.cssOptions?.injectAdditionalCssVarScope
    ?? injectAdditionalCssVarScope
  const uniAppXEnabled = styleOptions.uniAppX === true

  const moduleSpecifierReplacements = resolveRuntimePackageReplacements(replaceRuntimePackages)

  const styleHandler = createStyleHandler({
    ...styleOptions,
    escapeMap,
    injectAdditionalCssVarScope: resolvedInjectAdditionalCssVarScope,
    postcssOptions,
    uniAppXUnsupported: styleOptions.uniAppXUnsupported,
    cssCalc: styleOptions.cssCalc ?? cssCalcOptions,
    majorVersion: normalizeStyleHandlerMajorVersion(tailwindcssMajorVersion),
  })

  const jsHandlerOptions = Object.freeze({
    escapeMap,
    arbitraryValues,
    jsPreserveClass,
    generateMap: true,
    babelParserOptions,
    experimentalJsFastPath,
    ignoreCallExpressionIdentifiers,
    ignoreTaggedTemplateExpressionIdentifiers,
    uniAppX: uniAppXEnabled,
    moduleSpecifierReplacements,
  })
  const jsHandler = createJsHandler(jsHandlerOptions)

  const templateHandler = createTemplateHandler({
    customAttributesEntities,
    escapeMap,
    inlineWxs,
    jsHandler,
    disabledDefaultTemplateHandler,
  })

  return {
    styleHandler,
    jsHandler,
    templateHandler,
  }
}
