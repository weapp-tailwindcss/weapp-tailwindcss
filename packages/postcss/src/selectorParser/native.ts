import type { Root } from 'postcss-selector-parser'
import type { InternalCssSelectorReplacerOptions } from '../types'
import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { MappingChars2String } from '@weapp-tailwindcss/escape'

interface EscapeMappingEntry {
  key: number
  value?: string
}

export interface NativeSelectorBinding {
  escapeClasses: (values: string[], customMap?: EscapeMappingEntry[]) => string[]
}

const require = createRequire(import.meta.url)
const mappingCache = new WeakMap<Record<string, string>, EscapeMappingEntry[]>()
let binding: NativeSelectorBinding | undefined
let loadError: Error | undefined

function getLoadCandidates() {
  const packageRoot = path.dirname(require.resolve('@weapp-tailwindcss/postcss/package.json'))
  const nativePackage = `@weapp-tailwindcss/postcss-native-${process.platform}-${process.arch}`
  return [path.join(packageRoot, 'native', 'weapp-tailwindcss-postcss.node'), nativePackage]
}

/** 原生加载失败可以回退；原生转换本身的异常必须继续向上抛出。 */
export function loadNativeSelectorBinding(): NativeSelectorBinding | undefined {
  const mode = process.env.WEAPP_TW_NATIVE ?? 'auto'
  if (mode === 'off') {
    return undefined
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

/** 同一选择器 AST 的类名一次跨越 NAPI，展开伪类时复用原始值映射。 */
export function createNativeClassReplacements(root: Root, options?: InternalCssSelectorReplacerOptions) {
  const native = loadNativeSelectorBinding()
  if (!native) {
    return undefined
  }
  const values = new Set<string>()
  root.walkClasses((node) => {
    values.add(node.value)
  })
  if (values.size === 0) {
    return undefined
  }
  const originals = [...values]
  const replaced = native.escapeClasses(originals, resolveMapping(options?.escapeMap))
  if (replaced.length !== originals.length) {
    throw new Error('PostCSS Rust 选择器内核返回了不完整的类名批次。')
  }
  return new Map(originals.map((original, index) => [original, replaced[index]!]))
}

export function escapeNativeSelectorClasses(values: string[], options?: InternalCssSelectorReplacerOptions) {
  return loadNativeSelectorBinding()?.escapeClasses(values, resolveMapping(options?.escapeMap))
}
