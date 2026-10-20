import { describe, expect, it } from 'vitest'
import { cssDeclarations, retainsRuleContexts, stylesheetDependenciesRetained } from './tailwind-capabilities/css'
import { cssValueSignature } from './tailwind-capabilities/css/value'
import { defaultReferenceBuilder } from './tailwind-capabilities/reference'

function retains(actual: string, expected: string, candidate = 'probe') {
  return retainsRuleContexts(cssDeclarations(actual).contextsByClass.get(candidate) ?? [], cssDeclarations(expected).contextsByClass.get(candidate) ?? [])
}

describe('候选选择器与条件上下文', () => {
  it('完整官方参考保留依赖，连续批次不会串入上一批候选', async () => {
    const build = await defaultReferenceBuilder()
    const first = await build(['w-4', 'animate-spin', 'translate-x-4'])
    const second = await build(['w-8'])
    expect(cssDeclarations(first).byClass.has('w-4')).toBe(true)
    expect(cssDeclarations(second).byClass.has('w-4')).toBe(false)
    expect(cssDeclarations(second).byClass.has('w-8')).toBe(true)
    expect(first).toContain('--spacing:')
    expect(first).toContain('@keyframes spin')
    expect(first).toContain('@property')
    expect(stylesheetDependenciesRetained(first, first)).toBe(true)
    expect(stylesheetDependenciesRetained('.w-4{width:calc(var(--spacing)*4)}', first)).toBe(false)
  })

  it('后续覆盖和额外条件规则不能靠较早的正确声明通过', () => {
    expect(retains('.probe{width:32px;width:64px}', '.probe{width:32px}')).toBe(false)
    expect(retains('.probe{width:32px}@media print{.probe{width:64px}}', '.probe{width:32px}')).toBe(false)
    expect(retains('.probe{width:32px;width:32px}', '.probe{width:32px}')).toBe(true)
  })

  it('缺少主题变量、动画帧或 property 注册不能只凭相同 class 声明通过', () => {
    for (const dependency of [':root,:host{--spacing:.25rem}', '@supports not (color:lab(0% 0 0)){*,::before,::after{--tw-translate-x:0}}', '@keyframes spin{to{transform:rotate(360deg)}}', '@property --probe{syntax:"<number>";inherits:false;initial-value:0}']) {
      const candidate = '.probe{width:calc(var(--spacing)*4);animation:spin 1s;opacity:var(--probe)}'
      expect(stylesheetDependenciesRetained(`${dependency}${candidate}`, `${dependency}${candidate}`)).toBe(true)
      expect(stylesheetDependenciesRetained(candidate, `${dependency}${candidate}`)).toBe(false)
    }
    expect(stylesheetDependenciesRetained(':root,:host{--spacing:.25rem;--spacing:1rem}', ':root,:host{--spacing:.25rem}')).toBe(false)
    expect(stylesheetDependenciesRetained('@media print{:root,:host{--spacing:.25rem}}', ':root,:host{--spacing:.25rem}')).toBe(false)
  })

  it('主题字体的单双引号等价，不会让同批候选误报丢失依赖', () => {
    const expected = ':root,:host{--font-sans:Arial,\'Segoe UI\',sans-serif;--font-mono:\'Courier New\',monospace}'
    const actual = ':root,:host{--font-sans:Arial,"Segoe UI",sans-serif;--font-mono:"Courier New",monospace}'
    expect(stylesheetDependenciesRetained(actual, expected)).toBe(true)
    expect(stylesheetDependenciesRetained(`${actual}.probe{display:flex}`, `${expected}.probe{display:flex}`)).toBe(true)
    expect(stylesheetDependenciesRetained(actual.replace('Segoe UI', 'Segoe UI Variable'), expected)).toBe(false)
    expect(stylesheetDependenciesRetained(actual.replace('Courier New', 'Courier  New'), expected)).toBe(false)
  })

  it('字符串的引号和 CSS escape 可等价，内容及 token 边界仍保持独立', () => {
    expect(cssValueSignature('\'A B\'')).toBe(cssValueSignature('"A B"'))
    expect(cssValueSignature(String.raw`'A\20 B'`)).toBe(cssValueSignature('"A B"'))
    expect(cssValueSignature('calc(1px   +\n 2px)')).toBe(cssValueSignature('calc(1px + 2px)'))
    for (const [actual, expected] of [
      ['"A  B"', '"A B"'],
      ['"A\\tB"', '"A B"'],
      ['"A B"', 'A B'],
      ['A B', 'AB'],
      ['1 px', '1px'],
      ['calc(1px+2px)', 'calc(1px + 2px)'],
      ['var(--a, "A  B")', 'var(--a, "A B")'],
    ]) {
      expect(cssValueSignature(actual)).not.toBe(cssValueSignature(expected))
    }
  })

  it('property 注册和 keyframes 也保留引号等价及字符串中的空白语义', () => {
    const expected = '@property --probe{syntax:\'<string>\';inherits:false;initial-value:\'A B\'}@keyframes content{to{--label:\'A B\'}}'
    const actual = '@property --probe{syntax:"<string>";inherits:false;initial-value:"A B"}@keyframes content{to{--label:"A B"}}'
    expect(stylesheetDependenciesRetained(actual, expected)).toBe(true)
    expect(stylesheetDependenciesRetained(actual.replaceAll('A B', 'A  B'), expected)).toBe(false)
    expect(stylesheetDependenciesRetained(actual.replace('<string>', '<number>'), expected)).toBe(false)
  })

  it('hover 条件丢失或改为 focus 不能仅靠相同声明通过', () => {
    const expected = '.hover\\:flex:hover{display:flex}'
    expect(retains(expected, expected, 'hover:flex')).toBe(true)
    expect(retains('.hover\\:flex{display:flex}', expected, 'hover:flex')).toBe(false)
    expect(retains('.hover\\:flex:focus{display:flex}', expected, 'hover:flex')).toBe(false)
  })

  it('media 条件与范围必须一致', () => {
    const expected = '@media (width >= 48rem){.probe{display:flex}}'
    expect(retains(expected, expected)).toBe(true)
    expect(retains('.probe{display:flex}', expected)).toBe(false)
    expect(retains('@media (width >= 64rem){.probe{display:flex}}', expected)).toBe(false)
  })

  it('supports、container 与 starting-style 不能被移除或互相代替', () => {
    for (const condition of ['@supports (display: grid)', '@container card (width >= 20rem)', '@starting-style']) {
      const expected = `${condition}{.probe{display:flex}}`
      expect(retains(expected, expected)).toBe(true)
      expect(retains('.probe{display:flex}', expected)).toBe(false)
      expect(retains('@media (hover: hover){.probe{display:flex}}', expected)).toBe(false)
    }
  })

  it('嵌套选择器可以等价展开，但不能丢失父级、子级或兄弟关系', () => {
    const expected = '.probe{&:hover{>span{color:red}}}'
    expect(retains('.probe:hover>span{color:red}', expected)).toBe(true)
    expect(retains('.probe>span{color:red}', expected)).toBe(false)
    expect(retains('.probe:hover span{color:red}', expected)).toBe(false)
    expect(retains('.probe:hover+span{color:red}', expected)).toBe(false)
  })

  it('嵌套 at-rule 与选择器交换包裹位置时保留相同语义', () => {
    const expected = '.probe{&:hover{@media (hover: hover){color:red}}}'
    expect(retains('@media (hover: hover){.probe:hover{color:red}}', expected)).toBe(true)
    expect(retains('.probe:hover{color:red}', expected)).toBe(false)
  })

  it('selector parser 保留属性字符串中的 &，不会当作 nesting 替换', () => {
    const expected = '.probe{&[data-value="a&b"]{color:red}}'
    expect(retains('.probe[data-value="a&b"]{color:red}', expected)).toBe(true)
    expect(retains('.probe[data-value="ab"]{color:red}', expected)).toBe(false)
  })

  it('多父选择器通过 is 保留每次 nesting 的完整候选集合', () => {
    const parsed = cssDeclarations('.probe,.other{&+&{color:red}}')
    const contexts = parsed.contextsByClass.get('probe')!
    expect(contexts[0]!.selector).toBe(':is(.probe,.other)+:is(.probe,.other)')
    expect(retains('.probe+.probe,.other+.other{color:red}', '.probe,.other{&+&{color:red}}')).toBe(false)
  })

  it('默认 layer 包裹可忽略，值、important 与条件仍严格比较', () => {
    expect(retains('@layer utilities{.probe{width:32px!important}}', '.probe{width:32px!important}')).toBe(true)
    expect(retains('@layer utilities{.probe{width:32px}}', '.probe{width:32px!important}')).toBe(false)
    expect(retains('@layer utilities{@media print{.probe{width:32px}}}', '.probe{width:32px}')).toBe(false)
  })
})
