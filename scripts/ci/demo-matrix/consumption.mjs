import assert from 'node:assert/strict'
import { parseAsync } from '@babel/core'
import { parseMarkup, probeClasses } from './probe.mjs'

export async function consumedClasses(contents, item, round) {
  const expected = probeClasses(item, round)
  const found = new Map()
  function literalValue(node) {
    if (node?.type === 'StringLiteral') {
      return node.value
    }
    if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
      return node.quasis[0]?.value.cooked
    }
  }
  function record(id, marker, value) {
    const key = id?.startsWith('tw-matrix-') ? id.slice('tw-matrix-'.length) : undefined
    if (key && expected[key] && marker === round && typeof value === 'string') {
      found.set(expected[key], value.split(/\s+/).filter(Boolean))
    }
  }
  function visitMarkup(text) {
    function visit(node) {
      if (node.type === 1) {
        const props = Object.fromEntries(node.props.filter(prop => prop.type === 6).map(prop => [prop.name, prop.value?.content]))
        record(props.id, props['data-tw-matrix'], props.class)
      }
      node.children?.forEach(visit)
    }
    visit(parseMarkup(text, { onError() {} }))
  }
  function visitJs(node) {
    if (!node || typeof node !== 'object') {
      return
    }
    if (node.type === 'ObjectExpression') {
      const props = Object.fromEntries(node.properties.filter(prop => prop.type === 'ObjectProperty' && literalValue(prop.value) !== undefined).map(prop => [prop.key.name ?? prop.key.value, literalValue(prop.value)]))
      record(props.id, props['data-tw-matrix'], props.className ?? props.class)
    }
    if (node.type === 'StringLiteral' && node.value.includes('tw-matrix-') && node.value.includes('<')) {
      visitMarkup(node.value)
    }
    if (node.type === 'TemplateElement' && node.value.cooked?.includes('tw-matrix-') && node.value.cooked.includes('<')) {
      visitMarkup(node.value.cooked)
    }
    for (const value of Object.values(node)) {
      if (typeof value === 'object') {
        for (const child of Array.isArray(value) ? value : [value]) {
          visitJs(child)
        }
      }
    }
  }
  for (const { file, text } of contents) {
    if (file.endsWith('.js')) {
      visitJs(await parseAsync(text, { configFile: false, babelrc: false, sourceType: 'unambiguous' }))
    }
    else { visitMarkup(text) }
  }
  for (const value of Object.values(expected)) {
    assert.ok(found.get(value)?.length, `${item.id}: missing consumed class ${value}`)
  }
  return Object.fromEntries(found)
}
