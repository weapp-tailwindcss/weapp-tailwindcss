import type { IStyleHandlerOptions } from '../../types'
import postcss from 'postcss'
import { hasCssMacroStyleOptions, transformCssMacroCss } from '../../css-macro/auto'
import { createStyleHandler } from '../../handler'
import { applyConfiguredCssCalc } from '../../plugins/applyConfiguredCssCalc'
import { applyConfiguredCssUnits } from '../../plugins/applyConfiguredCssUnits'
import { dedupeCoveredCssRules } from '../../vite-css-rules'
import { protectDynamicColorMixAlpha } from '../color-mix'
import { pruneMiniProgramGeneratedCss } from '../mini-program-css'
import { normalizeMiniProgramColorMix } from '../mini-program-css/modern-colors'
import { normalizeTailwindcssRpxDeclarations, normalizeTailwindcssWebRpxDeclarations } from '../tailwindcss-rpx'

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
  const protectedCss = protectDynamicColorMixAlpha(compatibleCss, { customPropertyValues, lowerStaticSupports: true })
  const result = await defaultStyleHandler(normalizeMiniProgramColorMix(protectedCss.css), {
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
    cssOptions: options?.cssOptions,
    ...(isUniAppXUvueTarget ? { preserveContentInit: false } : {}),
    preservePreflight: true,
    preserveConditionalComments: hasCssMacroStyleOptions(options),
  }
  return pruneMiniProgramGeneratedCss(protectedCss.restore(result.css), pruneOptions)
}

function normalizeGeneratedWebRpxCss(css: string, convertUnits: boolean) {
  if (!/rpx/i.test(css)) {
    return css
  }

  try {
    const root = postcss.parse(css)
    const changed = convertUnits
      ? normalizeTailwindcssWebRpxDeclarations(root, { majorVersion: 4 })
      : normalizeTailwindcssRpxDeclarations(root, { majorVersion: 4 })
    return changed ? dedupeCoveredCssRules(root.toString()) : css
  }
  catch {
    return css
  }
}

export function transformTailwindV4WebRpxCss(css: string) {
  return normalizeGeneratedWebRpxCss(css, true)
}

export async function transformTailwindV4GeneratedCss(
  css: string,
  target: 'weapp' | 'web',
  options?: Partial<IStyleHandlerOptions> & { deferWebRpxConversion?: boolean | undefined },
  webRpxCompatibility = false,
) {
  if (target === 'weapp') {
    return transformTailwindV4CssToWeapp(css, options)
  }

  const webCss = hasCssMacroStyleOptions(options)
    ? transformCssMacroCss(css, options)
    : css
  const resolvedWebCss = await webCss
  // 属性语义必须在单位消失前纠正；只有通用单位兜底可以延后。
  const calculatedWebCss = await applyConfiguredCssCalc(resolvedWebCss, options ?? {})
  const normalizedWebCss = webRpxCompatibility ? normalizeGeneratedWebRpxCss(calculatedWebCss, false) : calculatedWebCss
  const convertedWebCss = await applyConfiguredCssUnits(normalizedWebCss, options ?? {})
  return webRpxCompatibility && !options?.deferWebRpxConversion
    ? transformTailwindV4WebRpxCss(convertedWebCss)
    : convertedWebCss
}
