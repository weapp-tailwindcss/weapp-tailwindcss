import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { repo } from '../../../scripts/ci/demo-matrix/catalog.mjs'
import { compileScript } from './precompile-script.mjs'

const require = createRequire(path.join(repo, 'demo/web/vue-vite7-tailwindcss-v4/package.json'))
const { parse } = require('vue/compiler-sfc')

export async function compileTemplateExpressions(compiler, source, snapshot, filename) {
  const prefix = '<template>'
  const { descriptor, errors } = parse(`${prefix}${source}</template>`, { filename })
  assert.equal(errors.length, 0, 'Vue 静态模板解析失败')
  const expressions = []
  function visit(node) {
    for (const prop of node.props ?? []) {
      if (prop.type === 7 && prop.name === 'bind' && prop.exp?.type === 4) expressions.push({ expression: prop.exp, attribute: true })
    }
    if (node.type === 5 && node.content?.type === 4) expressions.push({ expression: node.content, attribute: false })
    for (const child of node.children ?? []) visit(child)
  }
  visit(descriptor.template.ast)
  for (const { expression, attribute } of expressions.sort((a, b) => b.expression.loc.start.offset - a.expression.loc.start.offset)) {
    // 只委托被测编译器的精确 classNameSet 转换，不猜测动态表达式可能生成的类名。
    const wrapped = `(${expression.content})`
    const compiled = await compileScript(compiler, wrapped, snapshot, filename, 'ts')
    if (compiled === wrapped) continue
    assert.ok(compiled.startsWith('(') && compiled.endsWith(')'), '表达式转换改变了包装边界')
    let content = compiled.slice(1, -1).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    if (attribute) content = content.replaceAll('"', '&quot;').replaceAll("'", '&apos;')
    const start = expression.loc.start.offset - prefix.length
    const end = expression.loc.end.offset - prefix.length
    source = source.slice(0, start) + content + source.slice(end)
  }
  return source
}
