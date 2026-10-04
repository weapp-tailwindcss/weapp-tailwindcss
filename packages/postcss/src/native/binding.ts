import { createRequire } from 'node:module'
import path from 'node:path'
import process from 'node:process'
import { getNativeSelectorBindingSuffix } from '../selectorParser/native-platform'

export interface EscapeMappingEntry {
  key: number
  value?: string | undefined
}

export interface NativeSelectorRuleOptions {
  root?: string | undefined
  universal?: string | undefined
  child: string[]
  removeHover: boolean
  removeActive: boolean
  removeFocus: boolean
  uniAppX: boolean
}

export interface NativeSelectorRuleResult {
  selector: string
  remove: boolean
  spacing: boolean
}

export interface NativeSelectorRuleTransformer {
  transform: (value: string) => NativeSelectorRuleResult | null
}

export interface NativeCssBinding {
  SelectorRuleTransformer: new (options: NativeSelectorRuleOptions) => NativeSelectorRuleTransformer
  normalizeV4Declaration: (value: string, options: { gradientPosition?: boolean, gradientFallback?: string | undefined, radius?: boolean }) => string | null
  normalizeV4GradientPosition: (value: string) => string
  normalizeV4InfinityCalc: (value: string, wholeValue: boolean) => string
  normalizeV4VariableFallbacks: (value: string) => string | null
  normalizeUvueTransformValue: (value: string) => string | null
  normalizeUvueTransformValues: (values: string[]) => Array<string | null>
  escapeClasses: (values: string[], customMap?: EscapeMappingEntry[]) => string[]
  transformSelector: (value: string) => string | null
  transformSelectors: (values: string[]) => Array<string | null>
}

const require = createRequire(import.meta.url)
let binding: NativeCssBinding | undefined
let loadError: unknown
let failed = false

function resolveBinding() {
  const packageRoot = path.dirname(require.resolve('@weapp-tailwindcss/postcss/package.json'))
  const suffix = getNativeSelectorBindingSuffix()
  const candidates: string[] = []
  if (!suffix) {
    throw new Error(`不支持的原生平台：${process.platform}/${process.arch}`)
  }
  candidates.push(`@weapp-tailwindcss/native-${suffix}/postcss`)
  candidates.push(path.join(packageRoot, 'native', 'weapp-tailwindcss-postcss.node'))
  const errors: unknown[] = []
  for (const candidate of candidates) {
    let resolved: string
    try {
      resolved = require.resolve(candidate)
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException)?.code !== 'MODULE_NOT_FOUND') {
        throw error
      }
      errors.push(error)
      continue
    }
    // 已安装的包存在时，加载或 ABI 错误不能再由本地二进制掩盖。
    return require(resolved) as Partial<NativeCssBinding>
  }
  throw new AggregateError(errors, `无法解析 PostCSS Rust 内核（${process.platform}/${process.arch}）`)
}

/** 原生加载失败可以回退；原生转换本身的异常必须继续向上抛出。 */
export function loadNativeCssBinding(): NativeCssBinding | undefined {
  // CSS 原生内核仍属于已 profile 的边界实验，默认保留现有 PostCSS 实现。
  // 显式设置 WEAPP_TW_NATIVE=auto/required 时才启用，避免无意中改变完整构建的性能基线。
  const mode = process.env['WEAPP_TW_NATIVE'] ?? 'off'
  if (mode === 'off') {
    return undefined
  }
  if (mode !== 'auto' && mode !== 'required') {
    throw new Error(`无效的 WEAPP_TW_NATIVE 模式：${mode}`)
  }
  if (binding) {
    return binding
  }
  if (!failed) {
    try {
      const loaded = resolveBinding()
      if (typeof loaded.escapeClasses !== 'function') {
        throw new TypeError('原生模块缺少 escapeClasses 接口，可能存在 ABI 或版本不匹配。')
      }
      if (typeof loaded.transformSelector !== 'function' || typeof loaded.transformSelectors !== 'function') {
        throw new TypeError('原生模块缺少 transformSelector/transformSelectors 接口，可能存在 ABI 或版本不匹配。')
      }
      if (typeof loaded.SelectorRuleTransformer !== 'function' || typeof loaded.SelectorRuleTransformer.prototype?.transform !== 'function') {
        throw new TypeError('原生模块缺少 SelectorRuleTransformer 接口，可能存在 ABI 或版本不匹配。')
      }
      if (typeof loaded.normalizeV4VariableFallbacks !== 'function' || typeof loaded.normalizeUvueTransformValue !== 'function' || typeof loaded.normalizeUvueTransformValues !== 'function') {
        throw new TypeError('原生模块缺少值转换接口，可能存在 ABI 或版本不匹配。')
      }
      if (typeof loaded.normalizeV4Declaration !== 'function' || typeof loaded.normalizeV4GradientPosition !== 'function' || typeof loaded.normalizeV4InfinityCalc !== 'function') {
        throw new TypeError('原生模块缺少 v4 声明转换接口，可能存在 ABI 或版本不匹配。')
      }
      binding = loaded as NativeCssBinding
      return binding
    }
    catch (error) {
      failed = true
      loadError = error
    }
  }
  if (mode === 'required') {
    throw loadError
  }
  return undefined
}
