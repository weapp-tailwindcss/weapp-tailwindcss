import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { GeneratorSourceRecord } from '../source-resolver'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import type { InternalUserDefinedOptions } from '@/types/index'
import { resolveStyleOptionsFromContext } from '@/context/style-options'
import { hasTailwindApplyDirective, hasTailwindRootDirectives } from '../directives'
import { resolvePostcssRequestOption } from '../source-resolver/postcss-source'
import { isVueScopedStyleRequest } from '../style-requests'

export function mergeScopedRuntimeWithCurrentRuntime(
  scopedRuntime: Set<string>,
  runtime: Set<string>,
  options: {
    currentCssCandidates?: string[] | undefined
    cssHandlerOptions: IStyleHandlerOptions
    isolateCssSource: boolean
    majorVersion?: number | undefined
    matchedCssSourceFile: boolean
  },
) {
  if (options.isolateCssSource) {
    if (options.matchedCssSourceFile) {
      return new Set([
        ...scopedRuntime,
        ...(options.currentCssCandidates ?? []),
      ])
    }
    return new Set([
      ...scopedRuntime,
      ...(options.currentCssCandidates ?? []),
    ])
  }
  if (
    runtime.size === 0
    || !options.cssHandlerOptions.isMainChunk
  ) {
    return scopedRuntime
  }
  return new Set([
    ...scopedRuntime,
    ...runtime,
  ])
}

export function shouldIsolateScopedCssSource(
  _majorVersion: number | undefined,
  record: GeneratorSourceRecord,
  sourceEntries: TailwindSourceEntry[] | undefined,
  options: {
    cssHandlerOptions?: IStyleHandlerOptions | undefined
    target: string
  },
) {
  if (options.target !== 'weapp') {
    return false
  }
  const { metadata } = record
  if (metadata?.isolateCssSource) {
    return true
  }
  if (metadata?.matchedCssSourceFile && (sourceEntries?.length ?? 0) > 0) {
    return true
  }
  if (sourceEntries?.length === 0) {
    return false
  }
  return sourceEntries !== undefined && options.cssHandlerOptions?.isMainChunk !== true
}

export function shouldIsolateCurrentTailwindV4CssCandidates(
  _majorVersion: number | undefined,
  cssHandlerOptions: IStyleHandlerOptions,
  options: {
    hasGeneratedCss: boolean
    hasGeneratedMarkers: boolean
    rawSource: string
  },
) {
  return !cssHandlerOptions.isMainChunk
    && hasTailwindApplyDirective(options.rawSource)
    && !hasTailwindRootDirectives(options.rawSource)
    && !options.hasGeneratedCss
    && !options.hasGeneratedMarkers
}

export function shouldScanTailwindV4Sources(
  majorVersion: number | undefined,
  target: string,
  generatorRuntime: Set<string>,
  isolateCssSource: boolean,
) {
  if (majorVersion !== 4) {
    throw new Error('weapp-tailwindcss 生成管线仅支持 Tailwind CSS v4。')
  }
  if (target === 'web') {
    return true
  }
  if (isolateCssSource) {
    return false
  }
  return generatorRuntime.size === 0
}

export function shouldAppendWebBundleCssFallback(
  target: string,
  _options: {
    hasSourceDirectives: boolean
    hasMatchedCssSourceFile: boolean
  },
) {
  return target === 'web'
}

export function isEmptyCssSourceOrderParts(parts: {
  before: string
  after: string
}) {
  return parts.before.trim().length === 0 && parts.after.trim().length === 0
}

export function resolveGeneratorStyleOptions(
  opts: InternalUserDefinedOptions,
  cssHandlerOptions: IStyleHandlerOptions,
  generatorStyleOptions: Partial<IStyleHandlerOptions> | undefined,
): Partial<IStyleHandlerOptions> {
  const resolvedStyleOptions = resolveStyleOptionsFromContext(opts)
  const scopedVueStyleSource = isVueScopedStyleRequest(resolvePostcssRequestOption(cssHandlerOptions))
  const preflightStyleOptions: Partial<IStyleHandlerOptions> = {
    cssPreflight: scopedVueStyleSource ? false : resolvedStyleOptions.cssPreflight,
    cssPreflightRange: scopedVueStyleSource ? undefined : resolvedStyleOptions.cssPreflightRange,
  }
  return {
    ...resolvedStyleOptions,
    uniAppXCssTarget: opts.uniAppXCssTarget,
    uniAppXUnsupported: opts.uniAppXUnsupported,
    ...cssHandlerOptions,
    ...preflightStyleOptions,
    ...generatorStyleOptions,
  }
}
