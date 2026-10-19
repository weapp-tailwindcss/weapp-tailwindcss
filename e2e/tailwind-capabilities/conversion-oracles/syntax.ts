import { createRequire } from 'node:module'

const selectorParser = createRequire(new URL('../../../packages/postcss/package.json', import.meta.url))('postcss-selector-parser')

/** 默认类名编码的独立冻结合同，不调用产品 escape 或选择器转换器。 */
const encodedSymbols: Readonly<Record<string, string>> = {
  '[': '_b',
  ']': '_B',
  '(': '_p',
  ')': '_P',
  '#': '_h',
  '!': '_e',
  '/': '_f',
  '\\': '_r',
  '.': '_d',
  ':': '_c',
  '%': '_v',
  ',': '_m',
  '\'': '_a',
  '"': '_q',
  '*': '_x',
  '&': '_n',
  '@': '_t',
  '{': '_k',
  '}': '_K',
  '+': '_u',
  ';': '_j',
  '<': '_l',
  '~': '_w',
  '=': '_z',
  '>': '_g',
  '?': '_Q',
  '^': '_y',
  '`': '_i',
  '|': '_o',
  '$': '_s',
}

export function reviewedClassEncoding(candidate: string): string | undefined {
  if (!candidate || ![...candidate].every(character => /^[\w-]$/.test(character) || Object.hasOwn(encodedSymbols, character))) {
    return undefined
  }
  return [...candidate].map(character => encodedSymbols[character] ?? character).join('')
}

/** 只接收完整单类选择器；关系、伪类、标签和属性选择器另行审查。 */
export function reviewedClassSelector(selector: string, candidate: string): string | undefined {
  const encoded = reviewedClassEncoding(candidate)
  if (!encoded) {
    return undefined
  }
  const ast = selectorParser().astSync(selector)
  const nodes = ast.nodes.length === 1 ? ast.nodes[0].nodes : []
  return nodes.length === 1 && nodes[0].type === 'class' && nodes[0].value === candidate ? `.${encoded}` : undefined
}

/** 只接受不需要媒体范围降级或功能查询裁剪的条件。 */
export function reviewedConditions(conditions: readonly string[]): boolean {
  return conditions.every(condition => /^@media (?:print|screen|all)$/.test(condition))
}
