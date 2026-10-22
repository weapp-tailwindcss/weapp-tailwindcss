import postcss from 'postcss'
import { transformLynxCssCompat, transformWebCssCompat } from '@/index'

const pipelines = [
  ['Web', (css: string) => transformWebCssCompat(css, true)],
  ['Lynx', transformLynxCssCompat],
  ['Web → Lynx', (css: string) => transformLynxCssCompat(transformWebCssCompat(css, true))],
] as const

describe.each(pipelines)('%s 注册属性边界', (_name, transform) => {
  it.each(['', '@property --tw-gradient-position { syntax: "<length>"; inherits: false; initial-value: 5px; }'])('同名作者普通声明不能按梯度变量猜测转换：%s', (registration) => {
    const result = transform(`${registration} .probe { --tw-gradient-position: 10px; width: var(--tw-gradient-position); }`)
    expect(result).toContain('--tw-gradient-position: 10px')
  })
  it.each(['property', 'PROPERTY', String.raw`pro\70 erty`])('不改写 @%s 描述符或删掉仍被它引用的根变量', (name) => {
    const registration = `@${name} --color-brand { syntax: "<color>"; inherits: false; initial-value: var(--color-base); }`
    const css = `${registration} :root { --color-base: #00f; --color-brand: #f00; } .probe { color: var(--color-brand, #0f0); }`
    const result = transform(css)
    expect(result).toContain(registration)
    expect(result).toContain('--color-base: #00f')
    expect(result).toContain('color: var(--color-brand, #0f0)')
  })

  it.each([
    ['--tw-color-brand', 'syntax: "*"; inherits: false;'],
    ['--tw-shadow', 'syntax: "*"; inherits: true; initial-value: var(--color-base);'],
    ['--tw-gradient-position', 'syntax: "*"; inherits: false; initial-value: initial;'],
    ['--app-size', 'syntax: "<length>"; inherits: false; initial-value: calc(var(--spacing) * 2);'],
    ['--app-color', 'syntax: "<color>"; inherits: false; initial-value: color-mix(in oklab, red 50%, blue);'],
    ['--app-invalid', 'syntax: "*"; inherits: false; initial-value: calc(infinity * 1px); .nested { opacity: 50%; --tw-gradient-position: initial; background-clip: text; }'],
    ['--color-brand', '@layer x { syntax: "<color>"; inherits: false; initial-value: #00f; }'],
  ])('完整保留作者 %s 的注册子树，前缀不证明归属', (property, descriptors) => {
    const registration = `@property ${property} { ${descriptors} }`
    expect(transform(`${registration} :root { --color-base: #00f; --spacing: 2px; } .probe { width: var(--spacing); }`)).toContain(registration)
  })
})

function defaultRules(css: string) {
  const rules: postcss.Rule[] = []
  postcss.parse(css).walkRules(rule => {
    if (rule.selectors.includes('*') && rule.nodes.some(node => node.type === 'decl' && node.prop === '--tw-translate-x')) {
      rules.push(rule)
    }
  })
  return rules
}

const canonical = '@property --tw-translate-x { syntax: "*"; inherits: false; initial-value: 0; }'

it.each([
  'syntax: "*"; inherits: true; initial-value: 0;',
  'syntax: "<length>"; inherits: false; initial-value: 0;',
  'syntax: "*"; inherits: false;',
  'syntax: "*"; inherits: false; initial-value: 9;',
  'syntax: "*"; inherits: false; initial-value: 0 !important;',
  'syntax: "*"; inherits: false; initial-value: 0; unknown: 1;',
  'syntax: "*"; inherits: false; initial-value: 0; inherits: true;',
])('未知或冲突注册签名不合成默认声明：%s', (descriptors) => {
  const registration = `@property --tw-translate-x { ${descriptors} }`
  const result = transformWebCssCompat(`${registration} .probe { --tw-translate-x: initial; }`, true)
  expect(result).toContain(registration)
  expect(result).toContain('--tw-translate-x: initial')
  expect(defaultRules(result)).toHaveLength(0)
})

it.each(['@media all', '@supports (display: block)', '@theme', '@layer app'])('条件或非根注册 %s 不被提升成全局默认', (scope) => {
  expect(defaultRules(transformWebCssCompat(`${scope} { ${canonical} }`, true))).toHaveLength(0)
})

it('同名另一注册不匹配时否决全局默认合成', () => {
  const css = `${canonical} @media all { @property --tw-translate-x { syntax: "*"; inherits: true; initial-value: 9; } }`
  expect(defaultRules(transformWebCssCompat(css, true))).toHaveLength(0)
})

it('颜色 supports 中的注册不因兼容展开而变成无条件注册', () => {
  const css = `@supports (color: color-mix(in oklab, red, blue)) { ${canonical} }`
  expect(transformWebCssCompat(css, true)).toContain(css)
})

it.each(pipelines)('%s 不删除空注册', (_name, transform) => {
  expect(transform('@property --app-color {}')).toBe('@property --app-color {}')
})

it('默认兼容块在重复 Web 和 Web → Lynx 后保持幂等', () => {
  const web = transformWebCssCompat(canonical, true)
  expect(web).toContain(canonical)
  expect(defaultRules(web)).toHaveLength(1)
  expect(transformWebCssCompat(web, true)).toBe(web)
  const lynx = transformLynxCssCompat(web)
  expect(defaultRules(lynx)).toHaveLength(1)
  expect(transformLynxCssCompat(transformWebCssCompat(lynx, true))).toBe(lynx)
})

it('保留层时默认块放入最先的低优先级层', () => {
  const result = transformWebCssCompat(`${canonical} @layer app { .probe { --tw-translate-x: 10px; } }`, { features: { layer: false } })
  const rule = defaultRules(result)[0]!
  expect(rule.parent?.type).toBe('atrule')
  expect((rule.parent as postcss.AtRule).name).toBe('layer')
  expect(postcss.parse(result).first?.type).toBe('atrule')
  expect(transformWebCssCompat(result, { features: { layer: false } })).toBe(result)
})

it.each([true, { features: { layer: false } }] as const)('默认块不使 import 失效，重复处理不增加 layer 或默认块：%j', (options) => {
  const css = `@charset "UTF-8"; @layer __weapp_tw_defaults; @import "example.css"; ${canonical}`
  const result = transformWebCssCompat(css, options)
  const root = postcss.parse(result)
  const importIndex = root.nodes.findIndex(node => node.type === 'atrule' && node.name === 'import')
  const ruleIndex = root.nodes.findIndex(node => node.type === 'rule' || (node.type === 'atrule' && node.name === 'layer' && node.nodes))
  expect(importIndex).toBeGreaterThanOrEqual(0)
  expect(ruleIndex).toBeGreaterThan(importIndex)
  expect(defaultRules(result)).toHaveLength(1)
  expect(transformWebCssCompat(result, options)).toBe(result)
})
