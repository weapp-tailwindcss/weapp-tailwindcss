import { filterExistingCssRules } from '@weapp-tailwindcss/postcss/transform'
import { collectWebpackBareSelectorUserCss, createWebpackGeneratorUserCssSourceAppend, removeWebpackTailwindGeneratedAssetCss } from './pipeline-helpers'

export async function finalizeWebpackGeneratedCssResult(context: any) {
  const { ConcatSource, compilerOptions, cssHandlerOptions, currentRawSource, debug, file, finalizeCssAssetSource, finalizeTracedCss, generated, generatorRawSource, generatorRuntimeSet, isWebGeneratorTarget, runtimeState, shouldPreserveExistingPreflight, sourceCss, sourceCssProcessed, userRawSource } = context
  const finalizedGeneratedCss = generated
    ? finalizeCssAssetSource(
        isWebGeneratorTarget && currentRawSource.includes('tailwindcss v4.')
          ? createWebpackGeneratorUserCssSourceAppend(
            { css: generated.css, processed: true },
            {
              css: removeWebpackTailwindGeneratedAssetCss(currentRawSource),
              processed: true,
            },
          )?.css ?? generated.css
          : generated.css,
        {
          cssPreflight: cssHandlerOptions.isMainChunk,
          generatedCss: true,
          preserveExistingPreflight: shouldPreserveExistingPreflight,
        },
      )
    : isWebGeneratorTarget
      ? finalizeCssAssetSource(generatorRawSource, { generatedCss: false })
      : finalizeCssAssetSource(
          (await compilerOptions.styleHandler(generatorRawSource, cssHandlerOptions)).css,
          { generatedCss: false },
        )
  const sourceBareUserCss = isWebGeneratorTarget
    ? undefined
    : createWebpackGeneratorUserCssSourceAppend(
        ...[
          userRawSource,
          sourceCss === undefined
            ? undefined
            : {
                css: sourceCss,
                processed: sourceCssProcessed,
              },
          {
            css: generatorRawSource,
            processed: false,
          },
        ].map((source) => {
          if (source === undefined) {
            return undefined
          }
          return {
            css: collectWebpackBareSelectorUserCss(source.css),
            processed: source.processed,
          }
        }),
      )
  const handledSourceBareUserCss = sourceBareUserCss === undefined
    ? ''
    : sourceBareUserCss.processed
      ? sourceBareUserCss.css
      : (await compilerOptions.styleHandler(sourceBareUserCss.css, cssHandlerOptions)).css
  const finalizedSourceBareUserCss = handledSourceBareUserCss.trim().length === 0
    ? ''
    : finalizeCssAssetSource(handledSourceBareUserCss, {
        cssPreflight: false,
        generatedCss: false,
      })
  const missingSourceBareUserCss = finalizedSourceBareUserCss.trim().length === 0
    ? ''
    : filterExistingCssRules(finalizedGeneratedCss, finalizedSourceBareUserCss)
  const css = finalizeTracedCss(
    missingSourceBareUserCss.trim().length === 0
      ? finalizedGeneratedCss
      : createWebpackGeneratorUserCssSourceAppend(
        {
          css: finalizedGeneratedCss,
          processed: true,
        },
        {
          css: missingSourceBareUserCss,
          processed: true,
        },
      )!.css,
    cssHandlerOptions,
    { finalized: true },
  )
  const source = new ConcatSource(css)

  if (generated) {
    for (const className of generated.classSet) {
      generatorRuntimeSet.add(className)
    }
    debug('css handle via tailwind v%s engine(%s): %s', runtimeState.tailwindRuntime.majorVersion, generated.target, file)
  }
  else {
    debug('css handle: %s', file)
  }

  return {
    result: source,
  }
}
