import type { IStyleHandlerOptions } from '../../../types'
import type { GeneratedThemeDeclarationResolver } from './generated-cleanup'
import { applyConfiguredCssCalc } from '../../../plugins/applyConfiguredCssCalc'
import { filterExistingCssRules } from '../../../vite-css-rules'
import { removeUnsupportedMiniProgramAtRules } from '../../mini-program-css'
import { removeLocalUtilityMarkers } from '../../uni-app-x/local-utility-order'
import { removeTailwindApplyAtRules } from './at-rules'
import { removeTailwindSourceDirectives } from './directives'
import { removeTailwindV4GeneratedUserCssArtifacts } from './generated-cleanup'
import { stripTailwindBanners } from './markers'
import { collectBareSelectorUserCss, isCommentOnlyCss, removeProcessedMiniProgramUnsupportedCss, removeTailwindV4GeneratorAtRules, stripTailwindSourceMediaFragments, stripUnmatchedTailwindSourceMediaCloseFragments, unwrapMiniProgramCascadeLayers } from './source-fragments'

export async function transformGeneratorUserCss(
  source: string,
  options: {
    compileAuthorCssFunctions?: ((css: string) => Promise<string>) | undefined
    generatorTarget: string
    generatorStyleOptions: Partial<IStyleHandlerOptions>
    cssUserHandlerOptions: IStyleHandlerOptions
    styleHandler: (css: string, options: IStyleHandlerOptions) => Promise<{ css: string }>
    importFallback: boolean
    generatedSource?: string | GeneratedThemeDeclarationResolver | undefined
    processed?: boolean | undefined
  },
) {
  if (source.trim().length === 0) {
    return ''
  }
  if (options.processed) {
    const compiledSource = await options.compileAuthorCssFunctions?.(source) ?? source
    const cleanedSource = options.generatorTarget === 'weapp'
      ? removeTailwindV4GeneratedUserCssArtifacts(
          unwrapMiniProgramCascadeLayers(
            removeProcessedMiniProgramUnsupportedCss(compiledSource, {
              ...options.generatorStyleOptions,
              ...options.cssUserHandlerOptions,
            }),
          ),
          options.generatedSource,
        )
      : compiledSource
    return removeLocalUtilityMarkers(
      stripUnmatchedTailwindSourceMediaCloseFragments(
        stripTailwindSourceMediaFragments(
          removeTailwindV4GeneratorAtRules(cleanedSource),
        ),
      ),
    )
  }
  const repairedSource = stripUnmatchedTailwindSourceMediaCloseFragments(
    stripTailwindSourceMediaFragments(source),
  )
  const cleanedSource = removeLocalUtilityMarkers(
    removeTailwindSourceDirectives(
      removeTailwindV4GeneratorAtRules(repairedSource),
      {
        importFallback: options.importFallback,
      },
    ),
  )
  if (cleanedSource.trim().length === 0) {
    return ''
  }
  const sanitizedSource = removeTailwindSourceDirectives(
    stripUnmatchedTailwindSourceMediaCloseFragments(
      stripTailwindSourceMediaFragments(
        options.generatorTarget === 'weapp'
          ? removeTailwindV4GeneratedUserCssArtifacts(removeUnsupportedMiniProgramAtRules(unwrapMiniProgramCascadeLayers(stripTailwindBanners(cleanedSource))), options.generatedSource)
          : cleanedSource,
      ),
    ),
    {
      importFallback: options.importFallback,
    },
  )
  const authorSource = stripUnmatchedTailwindSourceMediaCloseFragments(removeTailwindApplyAtRules(sanitizedSource))
  const userSource = await options.compileAuthorCssFunctions?.(authorSource) ?? authorSource
  if (userSource.trim().length === 0) {
    return ''
  }
  if (isCommentOnlyCss(userSource)) {
    return userSource
  }
  if (options.generatorTarget !== 'weapp') {
    return applyConfiguredCssCalc(userSource, {
      cssCalc: options.generatorStyleOptions.cssOptions?.cssCalc
        ?? options.generatorStyleOptions.cssCalc
        ?? options.cssUserHandlerOptions.cssOptions?.cssCalc
        ?? options.cssUserHandlerOptions.cssCalc,
      customPropertyValues: options.generatorStyleOptions.customPropertyValues
        ?? options.cssUserHandlerOptions.customPropertyValues,
      customPropertyContextCss: options.generatorStyleOptions.customPropertyContextCss
        ?? options.cssUserHandlerOptions.customPropertyContextCss,
      contextCss: typeof options.generatedSource === 'string' ? options.generatedSource : undefined,
    })
  }
  const { css } = await options.styleHandler(userSource, {
    ...options.generatorStyleOptions,
    ...options.cssUserHandlerOptions,
  })
  const transformedCss = removeTailwindV4GeneratedUserCssArtifacts(removeUnsupportedMiniProgramAtRules(stripTailwindBanners(css)), options.generatedSource)
  const bareSelectorUserCss = collectBareSelectorUserCss(userSource, transformedCss)
  const missingBareSelectorUserCss = bareSelectorUserCss.trim().length > 0
    ? filterExistingCssRules(transformedCss, bareSelectorUserCss)
    : ''
  return missingBareSelectorUserCss.trim().length > 0
    ? `${transformedCss}\n${missingBareSelectorUserCss}`
    : transformedCss
}
