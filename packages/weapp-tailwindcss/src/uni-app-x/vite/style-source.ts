import type { parseVueRequest } from '@/bundlers/vite/query'
import { normalizeUniAppXImportantApplyForSass } from '@weapp-tailwindcss/postcss/transform'
import { extractSfcStyleBlocks } from '@/bundlers/vite/generate-bundle/sfc-style-source'
import { cleanUrl } from '@/bundlers/vite/utils'
import { parseVueLikeSfc } from '@/utils/sfc'

const VITE_CSS_HMR_MODULE_RE = /\b(?:const\s+__vite__css\s*=|__vite__updateStyle\s*\()/

type VueStyleQuery = ReturnType<typeof parseVueRequest>['query']

export function createUniAppXSfcStyleSources() {
  const snapshots = new Map<string, {
    styles: ReturnType<typeof extractSfcStyleBlocks>
    authored: ReturnType<typeof extractSfcStyleBlocks>
    output: string
    overrides: Map<number, string>
    hasGenerated: boolean
  }>()
  const managedIndices = new Map<string, Set<number>>()
  function getOverride(id: string, index: number) {
    const file = cleanUrl(id)
    const snapshot = snapshots.get(file)
    if (snapshot?.styles[index]) {
      return snapshot.overrides.get(index)
    }
    // 已删除的内联块仍可能被旧模块图请求；空 CSS 使旧样式失效。
    return managedIndices.get(file)?.has(index) ? '' : undefined
  }
  return {
    remember(id: string, source: string, output: string) {
      const file = cleanUrl(id)
      const previous = snapshots.get(file)
      // 重复转换已发布的 SFC 时保留原作者来源，避免把生成块重新当成作者块。
      const authored = previous?.output === source ? previous.authored : extractSfcStyleBlocks(source, file)
      const styles = extractSfcStyleBlocks(output, file)
      const overrides = new Map<number, string>()
      const indices = managedIndices.get(file) ?? new Set<number>()
      for (const [index, style] of styles.entries()) {
        // 外部样式始终由框架按 src 加载，不能用 SFC 的空内文覆盖。
        if (style.src !== undefined) {
          continue
        }
        indices.add(index)
        const original = authored[index]
        // 请求索引属于最终描述符；preflight 可前插，局部规则可修改作者块。
        if (!original || original.attrs !== style.attrs || original.source !== style.source) {
          overrides.set(index, style.source)
        }
      }
      snapshots.set(file, { styles, authored, output, overrides, hasGenerated: styles.length > authored.length })
      managedIndices.set(file, indices)
    },
    getOverride,
    shouldAppendLocalStyle(id: string, index: number) {
      const snapshot = snapshots.get(cleanUrl(id))
      return !snapshot || (Boolean(snapshot.styles[index]) && !snapshot.hasGenerated)
    },
    load(id: string, index: number) {
      const source = getOverride(id, index)
      return source === undefined ? undefined : { code: normalizeUniAppXImportantApplyForSass(source), map: null }
    },
  }
}

export function resolveUniAppXStyleSource(code: string, query: VueStyleQuery, styleSource?: string, filename = 'Component.uvue') {
  // Vite 的 CSS HMR 模块可能没有 `vue&type=style` 查询参数，但其内容仍是
  // 包含完整 SFC/template 的包装代码。此类 payload 不能继续交给 PostCSS。
  if (VITE_CSS_HMR_MODULE_RE.test(code)) {
    return { skip: true as const }
  }
  if (!query.vue || query.type !== 'style') {
    return { code }
  }
  if (styleSource === '') {
    return { code: '' }
  }
  const styleBlocks = extractSfcStyleBlocks(code, filename)
  if (styleBlocks.length === 0 && !parseVueLikeSfc(code).complete) {
    return { code }
  }
  // HX 的 CSS 编译可能早于本 hook；仅完整 SFC payload 需要按快照取块，
  // 已展开的 Sass、CSS import 和 URL 产物必须保留。
  if (styleSource !== undefined) {
    return { code: styleSource }
  }
  const style = styleBlocks[query.index ?? 0]
  return style ? { code: style.source } : { skip: true as const }
}

export function hasUniAppXImportantApply(source: string, normalize: (source: string) => string, file: string) {
  return extractSfcStyleBlocks(source, file).some(style => normalize(style.source) !== style.source)
}
