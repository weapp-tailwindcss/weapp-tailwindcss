import type { CssTokenSource, CssTokenSourceMap } from '@weapp-tailwindcss/postcss/transform'
import type { TailwindSourceEntry } from '@/tailwindcss/source-scan'
import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import process from 'node:process'
import { annotateCssTokenSources } from '@weapp-tailwindcss/postcss/transform'
import { replaceWxml } from '@/wxml'

export type { CssTokenSource, CssTokenSourceMap } from '@weapp-tailwindcss/postcss/transform'

export type CssSourceTraceGetter = (
  entries: TailwindSourceEntry[] | undefined,
) => CssTokenSourceMap | undefined

export interface CssSourceTraceOptions {
  root?: string | undefined
}

export type CssSourceTraceUserOptions = boolean | CssSourceTraceOptions

export interface AnnotateCssSourceTraceOptions {
  opts: InternalUserDefinedOptions
  tokenSources?: CssTokenSourceMap | undefined
}

function normalizeSourcePath(source: string, root: string) {
  const resolvedRoot = path.resolve(root)
  const resolvedSource = path.resolve(source)
  const relative = path.relative(resolvedRoot, resolvedSource)
  if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/')
  }
  return source.split(path.sep).join('/')
}

function getSourceTraceRoot(opts: InternalUserDefinedOptions) {
  const configured = opts.cssSourceTrace
  if (configured && typeof configured === 'object' && configured.root) {
    return configured.root
  }
  return opts.tailwindcssBasedir ?? process.cwd()
}

export function isCssSourceTraceEnabled(opts: Pick<InternalUserDefinedOptions, 'cssSourceTrace'>) {
  return opts.cssSourceTrace === true || (typeof opts.cssSourceTrace === 'object' && opts.cssSourceTrace !== null)
}

export function createCssTokenSourceMap(
  sourcesByToken: Map<string, Set<string>>,
  opts: InternalUserDefinedOptions,
): CssTokenSourceMap {
  const root = getSourceTraceRoot(opts)
  const tokenSources: CssTokenSourceMap = new Map()
  for (const [token, sources] of [...sourcesByToken.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const source: CssTokenSource = {
      token,
      sources: [...sources].map(file => normalizeSourcePath(file, root)).sort(),
    }
    tokenSources.set(token, source)
    const escaped = replaceWxml(token, { escapeMap: opts.escapeMap })
    tokenSources.set(escaped, source)
    tokenSources.set(escaped.replaceAll('\\', ''), source)
  }
  return tokenSources
}

export function createCssSourceTraceCacheSignature(
  tokenSources: CssTokenSourceMap | undefined,
  opts: Pick<InternalUserDefinedOptions, 'cssSourceTrace'>,
) {
  if (!isCssSourceTraceEnabled(opts)) {
    return 'css-source-trace:0'
  }
  if (!tokenSources?.size) {
    return 'css-source-trace:1:empty'
  }
  return `css-source-trace:1:${[...tokenSources.values()]
    .map(({ token, sources }) => `${token}<=${sources.join(',')}`)
    .sort()
    .join('|')}`
}

export function annotateCssSourceTrace(
  css: string,
  options: AnnotateCssSourceTraceOptions,
) {
  if (!isCssSourceTraceEnabled(options.opts) || !options.tokenSources?.size) {
    return css
  }
  return annotateCssTokenSources(css, options.tokenSources)
}
