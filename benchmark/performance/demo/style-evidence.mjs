import assert from 'node:assert/strict'
import postcss from 'postcss'
import { cssClasses } from '../../../scripts/ci/demo-matrix/output.mjs'
import { probeClasses } from '../../../scripts/ci/demo-matrix/probe.mjs'
import { coverage } from '../../../scripts/ci/demo-matrix/catalog.mjs'
import { roundFor } from './steps.mjs'

export function inspectExtraStyles(styles, consumed, item, operation) {
  const classes = consumed[probeClasses(item, roundFor(operation)).height]
  assert.ok(classes?.includes('cost-author'), '作者 CSS 的类名没有被页面实际消费')
  const authored = coverage(item) === 'authored-styles'
  if (!authored) assert.ok(classes.includes('bg-cost-config'), '主题配置的类名没有被页面实际消费')
  let width
  let background
  let theme
  for (const css of styles) {
    const root = postcss.parse(css)
    root.walkDecls('--color-cost-config', decl => { theme = decl.value.replace(/\s+/g, '') })
    root.walkRules(rule => {
      const names = cssClasses(rule.selector)
      if (names.includes('cost-author')) rule.walkDecls('width', decl => { width = decl.value })
      if (names.includes('bg-cost-config')) rule.walkDecls('background-color', decl => { background = decl.value.replace(/\s+/g, '') })
    })
  }
  assert.equal(width, `${operation === 'css' ? 43 : 41}${item.target === 'app' ? 'px' : 'rpx'}`, '本轮作者样式未进入可达样式图')
  if (!authored) {
    const expected = operation === 'config' ? ['#654321', 'rgb(101,67,33)'] : ['#123456', 'rgb(18,52,86)']
    assert.ok(expected.includes(background) || background === 'var(--color-cost-config)' && expected.includes(theme), '本轮配置失效／恢复样式未生效')
  }
  return { width, background: authored ? null : background, theme: background?.includes('var(') ? theme : null }
}
