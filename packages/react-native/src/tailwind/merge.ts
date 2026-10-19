import type { NativeStyleManifest } from '../types'
import { finalizeNativeManifest } from '../compiler'

/** 每个入口先解析自己的变量，再合并已编码规则，避免主题与前缀串入其它入口。 */
export function mergeNativeManifests(manifests: NativeStyleManifest[]): NativeStyleManifest {
  const merged: NativeStyleManifest = { version: 1, classSet: [], rules: {}, variables: {}, warnings: [] }
  const warnings = new Set<string>()
  let orderOffset = 0
  for (const manifest of manifests) {
    let entryOrder = 0
    Object.assign(merged.variables, manifest.variables)
    for (const [className, rules] of Object.entries(manifest.rules)) {
      const target = merged.rules[className] ??= []
      for (const rule of rules) {
        const localOrder = rule.order ?? 0
        const copied = { ...rule, style: { ...rule.style }, order: orderOffset + localOrder }
        // 单入口的 ID 不能在同名 class 合并后复用；统一按最终规则索引重新生成。
        delete copied.id
        target.push(copied)
        entryOrder = Math.max(entryOrder, localOrder + 1)
      }
    }
    for (const warning of manifest.warnings) {
      const key = JSON.stringify(warning)
      if (!warnings.has(key)) {
        warnings.add(key)
        merged.warnings.push(warning)
      }
    }
    orderOffset += entryOrder
  }
  return finalizeNativeManifest(merged)
}
