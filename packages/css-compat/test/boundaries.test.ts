import postcss from 'postcss'
import { expect, it } from 'vitest'
import { CascadeLayerError, compileCascadeLayers } from '../src'

function rejected(css: string, code: string, onConflict: 'warning' | 'error' = 'warning') {
  const root = postcss.parse(css, { from: 'boundaries.css' })
  const nodes = [...root.nodes]
  expect(() => compileCascadeLayers(root, { mode: 'ordered', onConflict })).toThrow(`[${code}]`)
  expect(root.toString()).toBe(css)
  expect(root.nodes.every((node, index) => node === nodes[index])).toBe(true)
  expect(compileCascadeLayers(root, { mode: 'preserve' })).toEqual({ root, diagnostics: [] })
  expect(root.toString()).toBe(css)
}

it.each([
  '@import "plain.css";@layer a{.probe{color:blue}}',
  '@import url("data:text/css,.probe%7Bcolor%3Ared%7D");',
  '@IMPORT "plain.css" supports(display:grid);@layer a;',
])('ordered 拒绝任何残留 import，preserve 保留 %s', css => rejected(css, 'LAYER_IMPORT'))

it.each(['a . b', 'a. b', 'a .b', 'a/**/ .b', 'a. /**/b'])('点号两侧独立空白非法 %s', name => {
  rejected(`@layer ${name}{.probe{color:red}}`, 'LAYER_NAME')
})

it.each(['a/**/.b', 'a./**/b', String.raw`a.\62 `, ' a.b ', 'a.b/**/'])('注释与转义终止空白合法 %s', name => {
  const root = postcss.parse(`@layer a.b;@layer ${name}{.probe{color:red}}`)
  expect(compileCascadeLayers(root, { mode: 'ordered', onConflict: 'error' }).diagnostics).toEqual([])
  expect(root.toString()).toContain('.probe{color:red}')
})

it.each([
  ['keyframes', String.raw`\73 pin`, 'spin'],
  ['keyframes', '"spin"', 'spin'],
  ['-webkit-keyframes', '"spin"', String.raw`\73 pin`],
  ['property', String.raw`--f\6f o`, '--foo'],
  ['counter-style', String.raw`\73 pin`, 'spin'],
  ['font-palette-values', String.raw`--f\6f o`, '--foo'],
  ['position-try', String.raw`--f\6f o`, '--foo'],
])('按类型解码 descriptor 别名 %s %s', (type, first, second) => {
  const body = type.includes('keyframes') ? 'to{opacity:1}' : 'x:y'
  const css = `@layer a,b;@layer a{@${type} ${first}{${body}}}@layer b{@${type} ${second}{${body}}}`
  const root = postcss.parse(css)
  const result = compileCascadeLayers(root, { mode: 'ordered' })
  const diagnostic = result.diagnostics.find(item => item.code === 'LAYER_DESCRIPTOR_ORDER')
  expect(diagnostic).toMatchObject({ severity: 'warning', related: { line: 1 }, source: { line: 1 } })
  let count = 0
  root.walkAtRules(type, () => { count++ })
  expect(count).toBe(2)
  rejected(css, 'LAYER_DESCRIPTOR_ORDER', 'error')
})

it('不确定 descriptor 身份时跨层保守诊断，同层与不同可确认身份保持独立', () => {
  const unknown = '@layer a,b;@layer a{@font-face{font-family:"X";src:url(a)}}@layer b{@font-face{font-family:X;src:url(b)}}'
  expect(compileCascadeLayers(postcss.parse(unknown), { mode: 'ordered' }).diagnostics[0]?.code).toBe('LAYER_DESCRIPTOR_ORDER')
  rejected(unknown, 'LAYER_DESCRIPTOR_ORDER', 'error')
  for (const css of [
    '@layer a{@font-face{font-family:X;src:url(a)}@font-face{font-family:X;src:url(b)}}',
    '@layer a,b;@layer a{@keyframes X{to{opacity:1}}}@layer b{@keyframes x{to{opacity:0}}}',
    '@layer a,b;@layer a{@property --X{syntax:"*"}}@layer b{@property --x{syntax:"*"}}',
  ]) {
    expect(compileCascadeLayers(postcss.parse(css), { mode: 'ordered', onConflict: 'error' }).diagnostics).toEqual([])
  }
})

it('转义属性别名被分析，自定义属性仍区分大小写', () => {
  for (const [first, second] of [[String.raw`--f\6f o`, '--foo'], [String.raw`c\6f lor`, 'COLOR']]) {
    const css = `@layer a,b;@layer a{#probe{${first}:red}}@layer b{.probe{${second}:blue}}`
    expect(compileCascadeLayers(postcss.parse(css), { mode: 'ordered' }).diagnostics[0]?.code).toBe('LAYER_SPECIFICITY')
    rejected(css, 'LAYER_SPECIFICITY', 'error')
  }
  const css = String.raw`@layer a,b;@layer a{#probe{--F\6f o:red}}@layer b{.probe{--foo:blue}}`
  expect(compileCascadeLayers(postcss.parse(css), { mode: 'ordered', onConflict: 'error' }).diagnostics).toEqual([])
})

it.each([
  ['grid-gap', 'gap'], ['grid-row-gap', 'row-gap'], ['grid-column-gap', 'column-gap'],
  ['font-variant', 'font-variant-caps'], ['font-synthesis', 'font-synthesis-style'],
  ['white-space', 'white-space-collapse'], ['text-box', 'text-box-trim'],
  ['view-timeline', 'view-timeline-inset'], ['marker', 'marker-start'],
  ['stroke', 'stroke-width'], ['vertical-align', 'baseline-source'], ['line-clamp', 'max-lines'],
  ['word-wrap', 'overflow-wrap'], ['page-break-before', 'break-before'],
  ['page-break-after', 'break-after'], ['page-break-inside', 'break-inside'],
])('属性别名覆盖普通及 important %s', (alias, canonical) => {
  for (const important of ['', '!important']) {
    for (const [first, second] of [[alias, canonical], [canonical, alias]]) {
      const high = important ? 'a' : 'b'
      const low = important ? 'b' : 'a'
      const css = `@layer a,b;@layer ${low}{#probe{${first}:initial${important}}}@layer ${high}{.probe{${second}:inherit${important}}}`
      expect(compileCascadeLayers(postcss.parse(css), { mode: 'ordered' }).diagnostics.some(item => item.code === 'LAYER_SPECIFICITY')).toBe(true)
      rejected(css, 'LAYER_SPECIFICITY', 'error')
    }
  }
})

it('strict 异常携带稳定诊断', () => {
  try {
    compileCascadeLayers(postcss.parse('@layer a .b;'), { mode: 'ordered' })
    throw new Error('应拒绝非法层名')
  }
  catch (error) {
    expect(error).toBeInstanceOf(CascadeLayerError)
  }
})
