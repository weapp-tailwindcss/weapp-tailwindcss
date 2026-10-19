import { describe, expect, it } from 'vitest'
import { cssDeclarations, retainsRuleContexts } from './tailwind-capabilities/css'

function retains(actual: string, expected: string, candidate = 'probe') {
  return retainsRuleContexts(cssDeclarations(actual).contextsByClass.get(candidate) ?? [], cssDeclarations(expected).contextsByClass.get(candidate) ?? [])
}

describe('候选选择器与条件上下文', () => {
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
