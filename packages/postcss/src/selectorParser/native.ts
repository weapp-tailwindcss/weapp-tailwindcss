import type { InternalCssSelectorReplacerOptions } from '../types'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { getNativeSelectorBindingSuffix } from './native-platform'

interface EscapeMappingEntry {
  key: number
  value?: string
}

export interface NativeSelectorBinding {
  escapeClasses: (values: string[], customMap?: EscapeMappingEntry[]) => string[]
  transformSelector: (value: string) => string | null
  transformSelectors: (values: string[]) => Array<string | null>
}

const require = createRequire(import.meta.url)
const mappingCache = new WeakMap<Record<string, string>, EscapeMappingEntry[]>()
let binding: NativeSelectorBinding | undefined
let loadError: Error | undefined

function getLoadCandidates() {
  const packageRoot = path.dirname(require.resolve('@weapp-tailwindcss/postcss/package.json'))
  const suffix = getNativeSelectorBindingSuffix()
  const candidates = [path.join(packageRoot, 'native', 'weapp-tailwindcss-postcss.node')]
  if (suffix) {
    candidates.push(`@weapp-tailwindcss/native-${suffix}/postcss`)
  }
  return candidates
}

/** 原生加载失败可以回退；原生转换本身的异常必须继续向上抛出。 */
export function loadNativeSelectorBinding(): NativeSelectorBinding | undefined {
  const mode = process.env.WEAPP_TW_NATIVE ?? 'auto'
  if (mode === 'off') {
    return undefined
  }
  if (mode !== 'auto' && mode !== 'required') {
    throw new Error(`无效的 WEAPP_TW_NATIVE 模式：${mode}`)
  }
  if (binding) {
    return binding
  }
  if (!loadError) {
    const errors: string[] = []
    for (const candidate of getLoadCandidates()) {
      try {
        const loaded = require(candidate) as Partial<NativeSelectorBinding>
        if (typeof loaded.escapeClasses !== 'function') {
          throw new TypeError('原生模块缺少 escapeClasses 接口，可能存在 ABI 或版本不匹配。')
        }
        if (typeof loaded.transformSelector !== 'function' || typeof loaded.transformSelectors !== 'function') {
          throw new TypeError('原生模块缺少 transformSelector/transformSelectors 接口，可能存在 ABI 或版本不匹配。')
        }
        binding = loaded as NativeSelectorBinding
        return binding
      }
      catch (error) {
        errors.push(`${candidate}: ${error instanceof Error ? error.message : String(error)}`)
      }
    }
    loadError = new Error(`无法加载 PostCSS Rust 选择器内核（${process.platform}/${process.arch}）。\n${errors.join('\n')}`)
  }
  if (mode === 'required') {
    throw loadError
  }
  return undefined
}

function resolveMapping(escapeMap: Record<string, string> | undefined) {
  if (escapeMap === undefined || escapeMap === MappingChars2String) {
    return undefined
  }
  let entries = mappingCache.get(escapeMap)
  if (!entries) {
    entries = Object.entries(escapeMap)
      .filter(([key]) => key.length === 1 && key.charCodeAt(0) < 128)
      .map(([key, value]) => ({ key: key.charCodeAt(0), value }))
    mappingCache.set(escapeMap, entries)
  }
  return entries
}

/** 原生内核只接管可完整处理的选择器；复杂语法与自定义映射继续经过 AST。 */
export function transformNativeSelector(value: string, options?: InternalCssSelectorReplacerOptions) {
  if (options?.escapeMap && options.escapeMap !== MappingChars2String) {
    return undefined
  }
  return loadNativeSelectorBinding()?.transformSelector(value) ?? undefined
}

export function escapeNativeSelectorClasses(values: string[], options?: InternalCssSelectorReplacerOptions) {
  return loadNativeSelectorBinding()?.escapeClasses(values, resolveMapping(options?.escapeMap))
}
