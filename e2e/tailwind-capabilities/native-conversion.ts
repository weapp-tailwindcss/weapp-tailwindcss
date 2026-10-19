import type { NativeStyleManifest } from '../../packages/react-native/src/types'
import type { ConversionSnapshot } from './conversion-audit'
import { addNativeVariantRules, compileNativeStylesheet, finalizeNativeManifest } from '../../packages/react-native/src/compiler'

/** 执行真实原生适配器转换；调用方须提前生成所有 platform 基础候选并登记独立合同。 */
export function convertNativeCandidates(css: string, classSet: Iterable<string>, candidates: readonly string[]) {
  const manifest = compileNativeStylesheet(css, { classSet })
  addNativeVariantRules(manifest, candidates)
  return finalizeNativeManifest(manifest)
}

/** 收集实际产物，保留隐藏的运行时表达式，不能用只看 style 的投影掩盖额外语义。 */
export function nativeConversionSnapshot(manifest: NativeStyleManifest | undefined, candidate: string): ConversionSnapshot {
  return {
    statements: (manifest?.rules[candidate] ?? []).flatMap((rule) => {
      const conditions = [rule.colorScheme ? `color-scheme:${rule.colorScheme}` : '', rule.platform ? `platform:${rule.platform}` : ''].filter(Boolean)
      const entries = [
        ...Object.entries(rule.style),
        ...Object.entries(rule).filter(([key, value]) => !['style', 'order', 'id', 'important', 'colorScheme', 'platform'].includes(key) && value !== undefined).map(([key, value]) => [`@native/${key}`, value] as const),
      ]
      return entries.map(([property, value]) => ({ selector: candidate, conditions, property, value, important: Boolean(rule.important) }))
    }),
    diagnostics: (manifest?.warnings ?? []).filter(warning => warning.className === candidate).map(warning => `${warning.property ?? ''}:${warning.message}`),
  }
}
