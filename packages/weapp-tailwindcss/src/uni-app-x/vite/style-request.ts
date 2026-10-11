import { normalizeTailwindcssV4InfinityCalcCss } from '@weapp-tailwindcss/postcss/transform'
import { cleanUrl } from '@/bundlers/vite/utils'
import { isSourcePreprocessorRequest } from '@/generation/style-requests'
import { logger } from '@/logger'
import { resolveStyleReferencePath } from '../style-reference-path'

const UVUE_NVUE_RE = /\.(?:uvue|nvue)$/
const CSS_MODULE_EXPORT_RE = /^\s*export\s+default\s+(?:\{|\w|\[\])/
const RELATIVE_REFERENCE_RE = /@reference\s+(["'])(\.\.?[\\/][^"']+)\1\s*;?/g

export function isPreprocessorRequest(id: string, lang?: string): boolean {
  return isSourcePreprocessorRequest(id, lang)
}

export function resolveUniAppXCssTarget(id: string) {
  return UVUE_NVUE_RE.test(cleanUrl(id)) ? 'uvue' : undefined
}

export function isCssModuleExport(code: string) {
  return CSS_MODULE_EXPORT_RE.test(code)
}

export function normalizeRelativeTailwindReferences(code: string, id: string) {
  if (!code.includes('@reference')) {
    return code
  }
  const sourceFile = cleanUrl(id)
  return code.replace(RELATIVE_REFERENCE_RE, (_full, quote: string, request: string) => {
    const resolved = resolveStyleReferencePath(sourceFile, request)
    return `@reference ${quote}${resolved}${quote};`
  })
}

interface ResolvePreprocessorTransformOptions {
  isIosPlatform: boolean
  isNativeAppStyleTarget: boolean
}

export function resolvePreprocessorTransform(
  code: string,
  id: string,
  lang: string | undefined,
  options: ResolvePreprocessorTransformOptions,
) {
  if (!isPreprocessorRequest(id, lang)) {
    return
  }
  if (options.isIosPlatform) {
    const normalizedCode = normalizeTailwindcssV4InfinityCalcCss(code)
    return {
      result: normalizedCode === code ? undefined : { code: normalizedCode, map: null },
    }
  }
  if (!options.isNativeAppStyleTarget) {
    return { result: undefined }
  }
}

export function reportStyleWarnings(result: { warnings?: () => { toString: () => string }[] }) {
  const warnings = typeof result.warnings === 'function' ? result.warnings() : []
  for (const warning of warnings) {
    logger.warn(warning.toString())
  }
}
