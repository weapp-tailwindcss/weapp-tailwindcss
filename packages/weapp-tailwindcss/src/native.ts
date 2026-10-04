import type { SourceAnalysis } from './js/fast-path/types'
import type { NativeJsEscapeEntry, NativeJsTransformer } from './native/types'
import type { NativeWxmlCompiler } from './wxml/native/types'
import { createRequire } from 'node:module'
import process from 'node:process'
import { getNativeBindingSuffix, requireNativeBinding } from './native/resolve'

export { getNativeBindingSuffix } from './native/resolve'

export interface NativeCompiler extends NativeWxmlCompiler {
  tokenizeWxml: (source: string) => Uint32Array
  analyzeJs: (source: string, lang: 'js' | 'jsx' | 'ts' | 'tsx', sourceType: 'module' | 'script' | 'unambiguous', preserveParens: boolean) => SourceAnalysis | null
  jsRuntimeSignature: (source: string) => string | null
  createJsTransformer: (classes: string[], effectiveEscapeEntries: NativeJsEscapeEntry[]) => NativeJsTransformer | null
}

const require = createRequire(import.meta.url)
let compiler: NativeCompiler | false | undefined
let loadError: unknown

function unavailable(mode: string) {
  if (mode === 'required') {
    throw new Error('WEAPP_TW_NATIVE=required, but the native compiler could not be loaded', { cause: loadError })
  }
  return undefined
}

export function loadNativeCompiler(): NativeCompiler | undefined {
  const mode = process.env['WEAPP_TW_NATIVE'] ?? 'auto'
  if (mode === 'off') {
    return undefined
  }
  if (mode !== 'auto' && mode !== 'required') {
    throw new Error(`Invalid WEAPP_TW_NATIVE mode: ${mode}`)
  }
  if (compiler === false) {
    return unavailable(mode)
  }
  if (compiler) {
    return compiler
  }
  try {
    const suffix = getNativeBindingSuffix()
    if (!suffix) {
      throw new Error(`Unsupported native platform: ${process.platform}-${process.arch}`)
    }
    const loaded = requireNativeBinding(require, suffix) as NativeCompiler
    for (const method of ['tokenizeWxml', 'createWxmlTransformer', 'analyzeJs', 'jsRuntimeSignature', 'createJsTransformer'] as const) {
      if (typeof loaded[method] !== 'function') {
        throw new TypeError(`Native compiler does not provide ${method}`)
      }
    }
    const jsTransformer = loaded.createJsTransformer([], [])
    if (!jsTransformer || typeof jsTransformer.transformWithCandidates !== 'function') {
      throw new TypeError('Native compiler does not provide transformWithCandidates')
    }
    compiler = loaded
    return compiler
  }
  catch (error) {
    compiler = false
    loadError = error
    return unavailable(mode)
  }
}
