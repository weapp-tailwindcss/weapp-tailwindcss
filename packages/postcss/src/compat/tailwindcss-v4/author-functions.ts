import type { AtRule, Declaration } from 'postcss'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'

const functionNames = new Set(['theme', '--theme', '--spacing', '--alpha'])
const functionPattern = /(?:theme|--theme|--spacing|--alpha)\(/

function hasCompilerFunction(value: string) {
  if (!functionPattern.test(value)) {
    return false
  }
  let found = false
  valueParser(value).walk((node) => {
    if (node.type === 'function' && functionNames.has(node.value)) {
      found = true
      return false
    }
  })
  return found
}

/** 将编译期函数值交给当前 Tailwind 编译上下文处理，保留声明的顺序与作用域。 */
export async function compileTailwindAuthorFunctions(
  css: string,
  compileValues: (values: string[]) => Promise<string[]>,
) {
  if (!functionPattern.test(css)) {
    return css
  }
  const root = postcss.parse(css)
  const nodes: Array<Declaration | AtRule> = []
  const values: string[] = []
  root.walk((node) => {
    const value = node.type === 'decl'
      ? node.value
      : node.type === 'atrule' && ['media', 'supports', 'container'].includes(node.name)
        ? node.params
        : undefined
    if (value !== undefined && hasCompilerFunction(value)) {
      nodes.push(node as Declaration | AtRule)
      values.push(value)
    }
  })
  if (values.length === 0) {
    return css
  }
  const compiled = await compileValues(values)
  if (compiled.length !== values.length) {
    throw new Error('Tailwind 作者样式函数编译结果数量不匹配。')
  }
  nodes.forEach((node, index) => {
    const value = compiled[index]!
    if (hasCompilerFunction(value)) {
      throw new Error(`Tailwind 作者样式函数尚未编译：${value}`)
    }
    if (node.type === 'decl') {
      node.value = value
    }
    else {
      node.params = value
    }
  })
  return root.toString()
}

/** 用唯一选择器承载待编译的值，避免依靠作者选择器或属性名猜测对应关系。 */
export function createTailwindAuthorFunctionProbe(values: string[], selector: string) {
  const root = postcss.root()
  const rule = postcss.rule({ selector })
  values.forEach((value, index) => rule.append(postcss.decl({ prop: `--value-${index}`, value })))
  root.append(rule)
  return {
    css: root.toString(),
    read(compiledCss: string) {
      const resolved = new Map<string, string>()
      postcss.parse(compiledCss).walkRules(selector, (compiledRule) => {
        compiledRule.walkDecls((declaration) => {
          resolved.set(declaration.prop, declaration.value)
        })
      })
      return values.map((_, index) => {
        const value = resolved.get(`--value-${index}`)
        if (value === undefined) {
          throw new Error(`Tailwind 作者样式函数编译结果缺少第 ${index} 个值。`)
        }
        return value
      })
    },
  }
}
