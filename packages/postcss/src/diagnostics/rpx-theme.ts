import type { Node } from 'postcss-value-parser'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'

export interface RpxCalcUsage {
  variables: string[]
  inlineRpx: boolean
}

function isRpx(node: Node) {
  const dimension = node.type === 'word' && valueParser.unit(node.value)
  return dimension && dimension.unit.toLowerCase() === 'rpx'
}

/** 只收集主题声明中的 rpx 维度，忽略字符串、注释与 URL。 */
export function collectRpxThemeVariables(css: string | postcss.Root): string[] {
  if (typeof css === 'string' && (!css.includes('@theme') || !/rpx/i.test(css))) {
    return []
  }
  try {
    const variables = new Set<string>()
    const root = typeof css === 'string' ? postcss.parse(css) : css
    root.walkAtRules('theme', (theme) => {
      theme.walkDecls((decl) => {
        if (!decl.prop.startsWith('--') || !/rpx/i.test(decl.value)) {
          return
        }
        valueParser(decl.value).walk((node) => {
          if (node.type === 'function' && node.value.toLowerCase() === 'url') {
            return false
          }
          if (isRpx(node)) {
            variables.add(decl.prop)
          }
        })
      })
    })
    return [...variables]
  }
  catch {
    return []
  }
}

/** 检查 calc 内的变量与内联 rpx；解析失败不报告安全结论。 */
export function inspectRpxCalcUsage(css: string, themeVariables: ReadonlySet<string>): RpxCalcUsage | undefined {
  const variables = new Set<string>()
  let inlineRpx = false
  if (!/calc\(/i.test(css)) {
    return { variables: [], inlineRpx }
  }
  try {
    postcss.parse(css).walkDecls((decl) => {
      if (!/calc\(/i.test(decl.value)) {
        return
      }
      valueParser(decl.value).walk((node) => {
        if (node.type !== 'function') {
          return
        }
        if (node.value.toLowerCase() === 'url') {
          return false
        }
        if (node.value.toLowerCase() !== 'calc') {
          return
        }
        valueParser.walk(node.nodes, (operand) => {
          if (isRpx(operand)) {
            inlineRpx = true
          }
          if (operand.type !== 'function') {
            return
          }
          if (operand.value.toLowerCase() === 'url') {
            return false
          }
          if (operand.value.toLowerCase() === 'var') {
            const name = operand.nodes.find(child => child.type !== 'space' && child.type !== 'comment')
            if (name?.type === 'word' && themeVariables.has(name.value)) {
              variables.add(name.value)
            }
          }
        })
        return false
      })
    })
    return { variables: [...variables], inlineRpx }
  }
  catch {
    return undefined
  }
}
