import type { parseVueRequest } from '@/bundlers/vite/query'
import { normalizeUniAppXImportantApplyForSass } from '@weapp-tailwindcss/postcss/transform'
import { extractSfcStyleBlocks } from '@/bundlers/vite/generate-bundle/sfc-style-source'
import { cleanUrl } from '@/bundlers/vite/utils'

const VITE_CSS_HMR_MODULE_RE = /\b(?:const\s+__vite__css\s*=|__vite__updateStyle\s*\()/

type VueStyleQuery = ReturnType<typeof parseVueRequest>['query']

export function createUniAppXSfcStyleSources() {
  const authoredByFile = new Map<string, ReturnType<typeof extractSfcStyleBlocks>>()
  const generatedByFile = new Map<string, Map<number, string>>()
  const generatedIndicesByFile = new Map<string, Set<number>>()
  function getGenerated(id: string, index: number) {
    const file = cleanUrl(id)
    if (authoredByFile.get(file)?.[index]) {
      return
    }
    // 已从当前 SFC 删除的生成块仍可能被模块图请求；返回空 CSS 使旧样式失效，
    // 不能把其所有权交还给只认识原始描述符的框架 loader。
    return generatedByFile.get(file)?.get(index)
      ?? (generatedIndicesByFile.get(file)?.has(index) ? '' : undefined)
  }
  return {
    rememberSource(id: string, source: string) {
      authoredByFile.set(cleanUrl(id), extractSfcStyleBlocks(source))
    },
    rememberGenerated(id: string, source: string) {
      const file = cleanUrl(id)
      const authoredCount = authoredByFile.get(file)?.length ?? 0
      const generated = new Map<number, string>()
      const generatedIndices = generatedIndicesByFile.get(file) ?? new Set<number>()
      // 原始描述符不包含追加块；保留主模块生成的实际索引和源码。
      for (const [index, style] of extractSfcStyleBlocks(source).entries()) {
        if (index >= authoredCount) {
          generated.set(index, style.source)
          generatedIndices.add(index)
        }
      }
      generatedByFile.set(file, generated)
      generatedIndicesByFile.set(file, generatedIndices)
    },
    getGenerated,
    hasGenerated(id: string) {
      return Boolean(generatedByFile.get(cleanUrl(id))?.size)
    },
    load(id: string, index: number) {
      const file = cleanUrl(id)
      const style = authoredByFile.get(file)?.[index]
      if (!style) {
        const generated = getGenerated(file, index)
        return generated === undefined ? undefined : { code: generated, map: null }
      }
      const normalized = normalizeUniAppXImportantApplyForSass(style.source)
      return normalized === style.source ? undefined : { code: normalized, map: null }
    },
  }
}

export function resolveUniAppXStyleSource(code: string, query: VueStyleQuery, generatedSource?: string) {
  // Vite 的 CSS HMR 模块可能没有 `vue&type=style` 查询参数，但其内容仍是
  // 包含完整 SFC/template 的包装代码。此类 payload 不能继续交给 PostCSS。
  if (VITE_CSS_HMR_MODULE_RE.test(code)) {
    return { skip: true as const }
  }
  if (!query.vue || query.type !== 'style') {
    return { code }
  }
  if (generatedSource !== undefined) {
    return { code: generatedSource }
  }
  const styleBlocks = extractSfcStyleBlocks(code)
  if (styleBlocks.length === 0) {
    return { code }
  }
  const style = styleBlocks[query.index ?? 0]
  return style ? { code: style.source } : { skip: true as const }
}

export function hasUniAppXImportantApply(source: string, normalize: (source: string) => string) {
  return extractSfcStyleBlocks(source).some(style => normalize(style.source) !== style.source)
}
