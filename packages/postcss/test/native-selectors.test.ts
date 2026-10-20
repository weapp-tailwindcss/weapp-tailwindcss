import { compileNativeCss } from '@/native'

describe('原生 selector 只归属于 AST 中的精确候选', () => {
  it('结构通配符和伪元素不是 preflight，必须诊断精确 utility', () => {
    const result = compileNativeCss(`
      *, ::before, ::after { box-sizing: border-box; }
      .group-hover\\:block:is(:where(.group):hover *) { display: block; }
      .peer-checked\\:opacity-100:is(:where(.peer):checked ~ *) { opacity: 100%; }
      .before\\:content-\\[\\'lynx\\'\\]::before { content: 'lynx'; }
      .theme-midnight\\:bg-black:where(.theme-midnight, .theme-midnight *) { background-color: black; }
      .lynx-at-variant:where(.theme-midnight, .theme-midnight *) { color: white; }
    `, { classSet: ['group-hover:block', 'peer-checked:opacity-100', 'before:content-[\'lynx\']', 'theme-midnight:bg-black', 'lynx-at-variant'] })
    expect(result.rules).toEqual({})
    expect(result.warnings.map(warning => warning.className)).toEqual([
      'group-hover:block',
      'peer-checked:opacity-100',
      'before:content-[\'lynx\']',
      'theme-midnight:bg-black',
      'lynx-at-variant',
    ])
    expect(result.warnings.at(-1)).toMatchObject({ property: 'selector' })
  })

  it('拒绝复合与后代选择器，嵌套规则沿 AST 父级关联而不猜测候选名', () => {
    const result = compileNativeCss(`
      .plain { color: red; & { width: 4px; } &::before { color: blue; } }
      .other .target { height: 8px; }
      .plain.extra { color: green; }
      [data-value=".fake"] { color: yellow; }
    `, { classSet: ['plain', 'target', 'fake'] })
    expect(result.rules.plain?.map(rule => rule.style)).toEqual([{ color: 'red' }, { width: 4 }])
    expect(result.rules.target).toBeUndefined()
    expect(result.warnings.map(warning => warning.className)).toEqual(['plain', 'target', 'plain'])
    expect(result.warnings.every(warning => warning.property === 'selector')).toBe(true)
  })
})
