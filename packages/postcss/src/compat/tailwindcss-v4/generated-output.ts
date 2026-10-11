import type { IStyleHandlerOptions } from '../../types'
import postcss from 'postcss'
import { hasCssMacroStyleOptions, transformCssMacroCss } from '../../css-macro/auto'
import { createStyleHandler } from '../../handler'
import { applyConfiguredCssCalc } from '../../plugins/applyConfiguredCssCalc'
import { protectDynamicColorMixAlpha } from '../color-mix'
import { pruneMiniProgramGeneratedCss } from '../mini-program-css'
import { normalizeTailwindcssWebRpxDeclarations } from '../tailwindcss-rpx'

const defaultStyleHandler = createStyleHandler({
  cssChildCombinatorReplaceValue: ['view', 'text'],
  cssRemoveActivePseudoClass: true,
  cssRemoveHoverPseudoClass: true,
  cssRemoveFocusPseudoClass: true,
  isMainChunk: true,
  majorVersion: 4,
})
const CSS_DECLARATION_URL_RE = /(:\s*)url\(([^\n\r"';[\]{}]*[[\]{}][^\n\r;]*)\)(?=\s*;)/g

export function normalizeTailwindV4GeneratedUrlValues(css: string) {
  return css.replace(CSS_DECLARATION_URL_RE, (match, prefix: string, urlValue: string) => {
    try {
      return `${prefix}url("${urlValue.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}")`
    }
    catch {
      return match
    }
  })
}

export async function transformTailwindV4CssToWeapp(
  css: string,
  options?: Partial<IStyleHandlerOptions>,
) {
  const macroCss = hasCssMacroStyleOptions(options)
    ? await transformCssMacroCss(css, options)
    : css
  const compatibleCss = normalizeTailwindV4GeneratedUrlValues(macroCss)
  const customPropertyValues = new Map([
    ...options?.customPropertyCompatibilityValues ?? [],
    ...options?.customPropertyValues ?? [],
  ])
  const protectedCss = protectDynamicColorMixAlpha(compatibleCss, { customPropertyValues })
  const result = await defaultStyleHandler(protectedCss.css, {
    cssChildCombinatorReplaceValue: ['view', 'text'],
    cssRemoveActivePseudoClass: true,
    cssRemoveHoverPseudoClass: true,
    cssRemoveFocusPseudoClass: true,
    isMainChunk: true,
    majorVersion: 4,
    ...options,
  })
  const isUniAppXUvueTarget = options?.uniAppX === true
    && options.uniAppXCssTarget === 'uvue'
  const pruneOptions = {
    ...(isUniAppXUvueTarget ? { preserveContentInit: false } : {}),
    preservePreflight: true,
    preserveConditionalComments: hasCssMacroStyleOptions(options),
  }
  return pruneMiniProgramGeneratedCss(protectedCss.restore(result.css), pruneOptions)
}

export function transformTailwindV4WebRpxCss(css: string) {
  if (!css.includes('rpx')) {
    return css
  }

  try {
    const root = postcss.parse(css)
    const changed = normalizeTailwindcssWebRpxDeclarations(root, { majorVersion: 4 })
    return changed ? root.toString() : css
  }
  catch {
    return css
  }
}

export async function transformTailwindV4GeneratedCss(
  css: string,
  target: 'weapp' | 'web',
  options?: Partial<IStyleHandlerOptions>,
  webRpxCompatibility = false,
) {
  if (target === 'weapp') {
    return transformTailwindV4CssToWeapp(css, options)
  }

  const webCss = hasCssMacroStyleOptions(options)
    ? transformCssMacroCss(css, options)
    : css
  const resolvedWebCss = await webCss
  const calculatedWebCss = await applyConfiguredCssCalc(resolvedWebCss, options ?? {})
  return webRpxCompatibility
    ? transformTailwindV4WebRpxCss(calculatedWebCss)
    : calculatedWebCss
}
