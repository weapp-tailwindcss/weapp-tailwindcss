import type { AtRule, Root } from 'postcss'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { CascadeLayerError, compileCascadeLayers, createCascadeLayersPlugin } from '../src'
import { consumeCascadeLayers } from '../src/legacy'
import { conflicts, safeCases } from './fixtures.mjs'

function values(root: Root) {
  const output: string[] = []
  root.walkDecls(decl => { output.push(`${decl.prop}:${decl.value}${decl.important ? '!' : ''}`) })
  return output
}

function compile(css: string, strict = true) {
  const root = postcss.parse(css, { from: 'layers.css' })
  return compileCascadeLayers(root, { mode: 'ordered', onConflict: strict ? 'error' : 'warning' })
}

it.each(safeCases)('$name 保持原生层顺序契约', ({ css, values: expected }) => {
  const result = compile(css)
  expect(values(result.root)).toEqual(expected)
  expect(result.diagnostics).toEqual([])
  expect(result.root.toString()).not.toMatch(/@layer/i)
})

it.each(conflicts)('$name 提供定位诊断且 strict 不修改原节点', ({ css }) => {
  const result = compile(css, false)
  expect(result.diagnostics.some(item => item.code === 'LAYER_SPECIFICITY')).toBe(true)
  const warning = result.diagnostics.find(item => item.code === 'LAYER_SPECIFICITY')!
  expect(warning.source).toMatchObject({ line: 1 })
  expect(warning.related?.line).toBe(1)
  expect(warning.selector).toBeDefined()
  expect(warning.property).toBeDefined()
  const root = postcss.parse(css)
  const nodes = [...root.nodes]
  expect(() => compileCascadeLayers(root, { mode: 'ordered', onConflict: 'error' })).toThrow(CascadeLayerError)
  expect(root.toString()).toBe(css)
  expect(root.nodes).toEqual(nodes)
  expect(root.nodes.every((node, index) => node === nodes[index])).toBe(true)
})

it.each([
  ['@import "x" layer(foo);', 'LAYER_IMPORT'],
  ['@import url(x) layer;', 'LAYER_IMPORT'],
  [String.raw`@import "x" l\61 yer(foo);`, 'LAYER_IMPORT'],
  ['@layer a{.x{color:revert-layer}}', 'LAYER_REVERT'],
  ['.x{color:var(--x, REVERT-LAYER)}', 'LAYER_REVERT'],
  [String.raw`.x{color:revert\2d layer}`, 'LAYER_REVERT'],
  ['.x{.y{color:red}}', 'LAYER_NESTING'],
  ['.x{@media (width:1px){.y{color:red}}}', 'LAYER_NESTING'],
  ['&.x{color:red}', 'LAYER_NESTING'],
  ['@layer a{.x{@media (width:1px){color:red!important}}}', 'LAYER_NESTING'],
  ['.x{@layer a{color:red}}', 'LAYER_NESTING'],
  ['@font-face{@layer a{font-family:x}}', 'LAYER_NESTING'],
  ['@layer;', 'LAYER_NAME'],
  ['@layer a,b{.x{color:red}}', 'LAYER_NAME'],
  ['@layer .a{.x{color:red}}', 'LAYER_NAME'],
  ['@layer a b;', 'LAYER_NAME'],
  ['@layer a,;', 'LAYER_NAME'],
  ['@layer a..b;', 'LAYER_NAME'],
  ['@layer initial;', 'LAYER_NAME'],
  ['@layer a{color:red}', 'LAYER_NESTING'],
  ['/* #ifdef MP-WEIXIN */@layer a{.x{color:red}}/* #endif */', 'LAYER_PREPROCESSOR'],
])('拒绝不满足前置条件的输入 %s', (css, code) => {
  const root = postcss.parse(css!)
  expect(() => compileCascadeLayers(root, { mode: 'ordered' })).toThrow(`[${code}]`)
  expect(root.toString()).toBe(css)
})

it('保留合法作者 not、字符串及 URL', () => {
  const css = String.raw`@layer a{.probe:not(#\#):not(#n){content:"revert-layer";background:url("revert-layer.png")}}`
  expect(compile(css).root.toString()).toContain(String.raw`.probe:not(#\#):not(#n)`)
  expect(compile(css).root.toString()).toContain('"revert-layer"')
})

it('preserve 保持节点身份、顺序和原生语法', () => {
  const css = '@layer a{.x{color:revert-layer;.y{color:red}}}'
  const root = postcss.parse(css)
  const nodes = [...root.nodes]
  const result = compileCascadeLayers(root, { mode: 'preserve', inputStage: 'polyfilled' })
  expect(result.diagnostics).toEqual([])
  expect(result.root).toBe(root)
  expect(root.toString()).toBe(css)
  expect(root.first).toBe(nodes[0])
})

it('必须显式选择 mode；已 polyfill 来源不猜测恢复', () => {
  const root = postcss.parse('.x{color:red}')
  // @ts-expect-error 缺少 mode 必须在运行时失败
  expect(() => compileCascadeLayers(root, {})).toThrow('LAYER_OPTIONS')
  expect(() => compileCascadeLayers(root, { mode: 'ordered', inputStage: 'polyfilled' })).toThrow('LAYER_INPUT_STAGE')
  expect(root.toString()).toBe('.x{color:red}')
})

it('无 layer 不改写 important、注释或空规则', () => {
  const css = '/*before*/.x{color:red!important;color:orange!important}.empty{}'
  const root = postcss.parse(css)
  const first = root.first
  expect(compileCascadeLayers(root, { mode: 'ordered' }).root.toString()).toBe(css)
  expect(root.first).toBe(first)
})

it('按作用域隔离状态，重复 Root 与序列化重读稳定', async () => {
  const processor = postcss([createCascadeLayersPlugin({ mode: 'ordered' })])
  for (const fixture of safeCases) {
    const root = compile(fixture.css).root
    const first = root.toString()
    compileCascadeLayers(root, { mode: 'ordered' })
    expect(root.toString()).toBe(first)
    expect(compile(first).root.toString()).toBe(first)
    const result = await processor.process(fixture.css, { from: undefined })
    expect(result.css).toBe(first)
    expect((await processor.process(result.css, { from: undefined })).css).toBe(first)
  }
  const results = await Promise.all(safeCases.map(item => processor.process(item.css, { from: undefined })))
  expect(results.map(item => values(item.root))).toEqual(safeCases.map(item => item.values))
})

it('条件首次注册有定位诊断，顶层预声明后消除', () => {
  const css = '@media (min-width:1px){@layer a{.x{color:red}}}'
  expect(compile(css, false).diagnostics[0]?.code).toBe('LAYER_CONDITIONAL_ORDER')
  expect(() => compile(css)).toThrow('LAYER_CONDITIONAL_ORDER')
  expect(compile(`@layer a;${css}`).diagnostics).toEqual([])
})

it('descriptor 不拆分、不重复，条件包装与 parent 关系完整', () => {
  const css = '@layer a,b;@layer a{@keyframes spin{from{opacity:0!important}to{opacity:1}}@font-face{font-family:test;src:url(test)}@property --x{syntax:"<color>";inherits:false;initial-value:red}}@media (width:1px){@supports (display:grid){@layer b{.x{/*once*/color:blue!important;background:red}}}}'
  const result = compile(css)
  for (const name of ['keyframes', 'font-face', 'property']) {
    let count = 0
    result.root.walkAtRules(name, () => { count++ })
    expect(count).toBe(1)
  }
  result.root.walk((node) => {
    expect(node.parent?.nodes).toContain(node)
  })
  expect(result.root.toString().match(/once/g)).toHaveLength(1)
  expect(result.root.toString()).toContain('opacity:0!important')
  const blue = result.root.nodes.find(node => node.type === 'atrule' && node.name === 'media')!
  expect(blue.toString()).toContain('@supports')
})

it('跨层同名 descriptor、未知函数和包装采用显式诊断', () => {
  expect(compile('@layer a,b;@layer a{@keyframes x{to{opacity:1}}}@layer b{@keyframes x{to{opacity:0}}}', false).diagnostics[0]?.code).toBe('LAYER_DESCRIPTOR_ORDER')
  expect(compile('@layer a{.x:future(foo){color:red}}', false).diagnostics[0]?.code).toBe('LAYER_SELECTOR_UNKNOWN')
  expect(compile('@layer a;@future{@layer a{.x{color:red}}}', false).diagnostics[0]?.code).toBe('LAYER_WRAPPER_SEMANTICS')
})

it('自定义属性大小写独立，all 不覆盖自定义属性和 direction', () => {
  const css = '@layer a,b;@layer a{#x{--Color:red;direction:rtl}}@layer b{.x{--color:blue;all:initial}}'
  expect(compile(css).diagnostics).toEqual([])
})

it('同层权重差异及不同属性不误报', () => {
  expect(compile('@layer a{#x{color:red}.x{color:blue}}').diagnostics).toEqual([])
  expect(compile('@layer a,b;@layer a{#x{color:red}}@layer b{.x{width:1px}}').diagnostics).toEqual([])
})

it('诊断通过 PostCSS warnings 携带稳定 code 与位置', async () => {
  const result = await postcss([createCascadeLayersPlugin({ mode: 'ordered' })]).process(conflicts[0]!.css, { from: 'input.css', to: 'output.css', map: { inline: false } })
  expect(result.warnings()[0]).toMatchObject({ line: 1, plugin: 'weapp-css-compat-layers', code: 'LAYER_SPECIFICITY' })
  expect(result.map?.toJSON().sourcesContent).toEqual([conflicts[0]!.css])
})

it('合并多文件 Root 后 warning 使用对应原始节点与相关来源', async () => {
  const root = postcss.parse('@layer a,b;\n@layer a{#probe{color:red}}', { from: 'low.css' })
  const high = postcss.parse('@layer b{\n.probe{color:blue}}', { from: 'high.css' })
  const original = (high.first as AtRule).nodes![0]!
  root.append(high.nodes)
  const result = await postcss([createCascadeLayersPlugin({ mode: 'ordered' })]).process(root, { from: 'merged.css' })
  const warning = result.warnings()[0]!
  expect(warning.node).toBe(original)
  expect(warning).toMatchObject({ line: 2, column: 1, code: 'LAYER_SPECIFICITY' })
  expect(warning.toString()).toContain('high.css:2:1')
  expect((warning as typeof warning & { diagnostic: { source: { file: string }, related: { file: string } } }).diagnostic).toMatchObject({
    source: { file: expect.stringContaining('high.css') },
    related: { file: expect.stringContaining('low.css') },
  })
})

it('保留 prologue，source map 关联原始来源', async () => {
  const css = '@charset "UTF-8";@namespace svg "http://www.w3.org/2000/svg";\n@layer a{.x{color:red!important}}'
  const result = await postcss([createCascadeLayersPlugin({ mode: 'ordered' })]).process(css, { from: 'input.css', to: 'output.css', map: { inline: false } })
  expect(result.css.indexOf('@charset')).toBeLessThan(result.css.indexOf('.x'))
  expect(result.map?.toJSON().sourcesContent).toEqual([css])
})

it('legacy 原样保留 anchor 与 important 行为，新 API 单独修正', () => {
  for (const css of [safeCases[2]!.css, safeCases[3]!.css]) {
    const legacy = postcss.parse(css)
    consumeCascadeLayers(legacy)
    expect(legacy.toString()).not.toBe(compile(css).root.toString())
  }
})

describe('规模保护', () => {
  it('大量同属性规则的诊断规模保持线性', () => {
    const css = `@layer a,b;@layer a{${Array.from({ length: 1000 }, (_, i) => `#x${i}{color:red}`).join('')}}@layer b{${Array.from({ length: 1000 }, (_, i) => `.x${i}{color:blue}`).join('')}}`
    expect(compile(css, false).diagnostics).toHaveLength(1000)
  })
})

it('逻辑尺寸与未知属性保守诊断，不访问属性表原型', () => {
  for (const property of ['inline-size', 'constructor', '__proto__']) {
    expect(compile(`@layer a,b;@layer a{#x{${property}:1px}}@layer b{.x{width:2px}}`, false).diagnostics[0]?.code).toBe('LAYER_SPECIFICITY')
  }
  expect(compile('@layer a{.x:future(){color:red}}', false).diagnostics[0]?.code).toBe('LAYER_SELECTOR_UNKNOWN')
})
