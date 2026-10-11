import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { TailwindV4CssSource } from './types'
import path from 'node:path'

export function resolvePostcssFromOption(cssHandlerOptions: IStyleHandlerOptions) {
  const from = cssHandlerOptions.postcssOptions?.options?.from
  return typeof from === 'string' && from.length > 0 ? from : undefined
}

export function resolvePostcssRequestOption(cssHandlerOptions: IStyleHandlerOptions) {
  return resolveCssHandlerSourceOptions(cssHandlerOptions)?.requestFile
    ?? resolvePostcssFromOption(cssHandlerOptions)
}

export function resolvePostcssSourceFile(cssHandlerOptions: IStyleHandlerOptions) {
  const from = resolvePostcssFromOption(cssHandlerOptions)
  if (!from || !path.isAbsolute(from)) {
    return undefined
  }
  return from.replace(/[?#].*$/, '')
}

export function resolveCssHandlerSourceOptions(cssHandlerOptions: IStyleHandlerOptions) {
  return (cssHandlerOptions as {
    sourceOptions?: {
      outputRoot?: string | undefined
      requestFile?: string | undefined
      sourceFile?: string | undefined
      sourceCss?: string | undefined
      cssSources?: TailwindV4CssSource[] | undefined
      cssEntries?: string[] | undefined
    } | undefined
  }).sourceOptions
}

export function resolveCssSourceBase(file: string, cssHandlerOptions: IStyleHandlerOptions) {
  const from = resolvePostcssFromOption(cssHandlerOptions)
  const baseFile = from ?? file
  const normalized = baseFile.replace(/[?#].*$/, '')
  return path.dirname(path.resolve(normalized))
}
