import { expect, it } from 'vitest'
import { collectTracedRootRules, joinOutputsWithoutCssSourceTraces } from './snapshot/css-source-trace'

it.each(['/* tokens:', '/*tokens:', '/*! tokens:', '/*!tokens:'])('只剥除样式中的真实 %s 追踪，不掩盖 CSS、JS 和模板字面量泄漏', (prefix) => {
  const literal = `${prefix} leak <= raw-class */`
  const css = `/*! license *//* tokens: glossary raw-class */${prefix} a <= trace-only.vue */.a{content:"${literal}"}`
  const script = `const value = "${literal}"`
  const markup = `<view>${literal}</view>`
  const result = joinOutputsWithoutCssSourceTraces([
    { name: 'a.wxss', content: css },
    { name: 'a.js', content: script },
    { name: 'a.wxml', content: markup },
  ])
  expect(result).not.toContain('trace-only.vue')
  expect(result).toContain('/*! license */')
  expect(result).toContain('/* tokens: glossary raw-class */')
  expect(result).toContain(`content:"${literal}"`)
  expect(result).toContain(script)
  expect(result).toContain(markup)
})

it('无效样式不得被静默清空为无泄漏', () => {
  expect(() => joinOutputsWithoutCssSourceTraces([{ name: 'broken.css', content: '.a{color:red' }])).toThrow()
})

it.each(['/* tokens:', '/*tokens:', '/*! tokens:', '/*!tokens:'])('精确选择根级规则并只绑定紧邻的 %s 追踪', (prefix) => {
  const selectors = new Set(['.probe'])
  const trace = `${prefix} probe <= page.vue */`
  const rule = '.probe { color: red; }'
  expect(collectTracedRootRules(`${trace}${rule}`, selectors)).toEqual([`${trace}\n${rule}`])
  for (const separator of ['/*! author */', '.other{}', '@media screen{}']) {
    expect(collectTracedRootRules(`${trace}${separator}${rule}`, selectors)).toEqual([rule])
  }
  expect(collectTracedRootRules(`@media screen{${trace}${rule}}.probe-other{}`, selectors)).toEqual([])
})
