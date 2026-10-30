import type { ProcessOptions } from 'postcss'
import { normalizeCssLineComments } from './compat/line-comments'

/** 自动读取的外部 map 不属于 CSS 与配置快照，须交给本轮 PostCSS 重新发现。 */
export function mayLoadExternalSourceMap(css: string, options?: ProcessOptions): boolean {
  const map = options?.map
  const previous = map && typeof map === 'object' ? map.prev : undefined
  if (map === false || previous === false || previous) {
    return false
  }
  // 普通命中路径不提前做准备；行注释规范化也可能产生有效的 map 引用。
  if (!css.includes('sourceMappingURL=')) {
    return false
  }
  const source = normalizeCssLineComments(css)
  // 与 PostCSS PreviousMap 一样按最后一个文本标记判定，包括字符串中的标记。
  const marker = source.match(/\/\*\s*# sourceMappingURL=/g)?.at(-1)
  if (!marker) {
    return false
  }
  const start = source.lastIndexOf(marker)
  const end = source.indexOf('*/', start)
  if (end === -1) {
    return false
  }
  const annotation = source.slice(start + marker.length, end).trim()
  return annotation.length > 0 && !annotation.startsWith('data:')
}
