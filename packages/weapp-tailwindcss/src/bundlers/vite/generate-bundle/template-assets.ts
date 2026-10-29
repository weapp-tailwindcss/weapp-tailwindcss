import type { BundleSnapshot } from '../bundle-state'
import type { ViteFrameworkTemplateAssetContext } from '../shared/framework-asset-strategy'
import path from 'node:path'
import { normalizeOutputPathKey } from '@/bundlers/shared/module-graph'

type TemplateStyleAsset = ViteFrameworkTemplateAssetContext['styles'][number]

/** 小程序模板与组件样式的同名关联来自产物图，后缀由当前实际资产确定。 */
export function collectTemplateAssetStyles(snapshot: BundleSnapshot, previousStyles = new Map<string, TemplateStyleAsset>()) {
  if (!snapshot.hasOmittedKnownFiles) {
    previousStyles.clear()
  }
  for (const file of snapshot.removedFiles) {
    previousStyles.delete(normalizeOutputPathKey(file))
  }
  for (const entry of snapshot.entries) {
    const file = normalizeOutputPathKey(entry.file)
    if (entry.type === 'css' && entry.output.type === 'asset') {
      previousStyles.set(file, Object.freeze({ fileName: file, source: entry.source }))
    }
    else {
      previousStyles.delete(file)
    }
  }
  const stylesByStem = new Map<string, ViteFrameworkTemplateAssetContext['styles'][number][]>()
  for (const [file, style] of previousStyles) {
    const parsed = path.posix.parse(file)
    const stem = path.posix.join(parsed.dir, parsed.name)
    const styles = stylesByStem.get(stem) ?? []
    styles.push(style)
    stylesByStem.set(stem, styles)
  }
  return (file: string): ViteFrameworkTemplateAssetContext['styles'] => {
    const parsed = path.posix.parse(normalizeOutputPathKey(file))
    return Object.freeze(stylesByStem.get(path.posix.join(parsed.dir, parsed.name)) ?? [])
  }
}
