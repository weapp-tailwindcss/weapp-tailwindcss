import { transformLynxCssCompat, transformWebCssCompat } from '@/index'

describe('Lynx 主题变量的 CSS 身份与完整依赖图', () => {
  const pipelines = [
    ['Web', (css: string) => transformWebCssCompat(css, true)],
    ['Lynx', transformLynxCssCompat],
    ['Web → Lynx', (css: string) => transformLynxCssCompat(transformWebCssCompat(css, true))],
  ] as const

  describe.each(pipelines)('%s', (_name, transform) => {
    it('空的首声明仍参与 root/host 冲突分析', () => {
      const css = ':root { --color-brand: ; } :host { --color-brand: #f00; } .probe { color: var(--color-brand, #00f); }'
      expect(transform(css)).toContain('color: var(--color-brand, #00f)')
    })

    it('attr 在变量定义元素求值，不移动到消费元素', () => {
      const css = ':root { --color-brand: attr(data-color type(<color>), red); } .probe { color: var(--color-brand); }'
      expect(transform(css)).toContain('color: var(--color-brand)')
    })

    it.each([String.raw`\61 ttr(data-color type(<color>), red)`, 'attr(data-color type(<color>), red)'])('CSS token 函数 %s 不跨元素静态化', (value) => {
      expect(transform(`:root { --color-brand: ${value}; } .probe { color: var(--color-brand); }`)).toContain('color: var(--color-brand)')
    })

    it.each(['PROPERTY', String.raw`\70 roperty`])('注册指令 %s 的解码身份也保护元素求值边界', (name) => {
      const css = `@${name} --color-brand { syntax: "<color>"; inherits: false; initial-value: #00f; } :root { --color-brand: #f00; } .probe { color: var(--color-brand); }`
      expect(transform(css)).toContain('color: var(--color-brand)')
    })

    it('长别名链只求值一次，并保持第二轮处理幂等', () => {
      const declarations = ['--color-token-0: #f00;']
      for (let index = 1; index <= 64; index++) {
        declarations.push(`--color-token-${index}: var(--color-token-${index - 1});`)
      }
      for (const ordered of [declarations, [...declarations].reverse()]) {
        const result = transform(`:root { ${ordered.join(' ')} } .probe { background-color: var(--color-token-64); }`)
        expect(result).toContain('background-color: #f00')
        expect(transform(result)).toBe(result)
      }
    })
    it('主变量稳定时保留缺失 fallback 引用所需的定义或正确内联主值', () => {
      const css = ':root { --color-brand: #f00; --color-alias: var(--color-brand, var(--runtime-brand)); } .probe { background-color: var(--color-alias); }'
      const result = transform(css)
      if (result.includes('var(--color-brand')) {
        expect(result).toContain('--color-brand: #f00')
      }
      else {
        expect(result).toContain('background-color: #f00')
      }
    })

    it('CSS-wide keyword 的转义身份仍阻止静态化', () => {
      const css = String.raw`:root { --color-brand: \69 nitial; } .probe { background-color: var(--color-brand, #00f); }`
      expect(transform(css)).toContain('background-color: var(--color-brand, #00f)')
    })
    it.each([
      '--color-brand: var(--color-base, var(--color-brand));',
      '--color-brand: var(--color-base, var(--color-alias)); --color-alias: var(--color-brand);',
    ])('保留 fallback 中形成的循环及 use-site fallback：%s', (declarations) => {
      const css = `:root { --color-base: #f00; ${declarations} } .probe { background-color: var(--color-brand, #00f); }`
      const result = transform(css)
      expect(result).toContain('background-color: var(--color-brand, #00f)')
      expect(result).toContain('--color-brand:')
      expect(transform(result)).toBe(result)
    })

    it.each([':root', ':host'])('识别 %s 变量名的转义覆盖与转义引用', (scope) => {
      const css = String.raw`${scope} { --color-brand: #f00; } .theme-dark { --color-br\61nd: #00f; } .probe { background-color: var(--color-brand); } .escaped { color: var(--color-br\61nd); }`
      const result = transform(css)
      expect(result).toContain('background-color: var(--color-brand)')
      expect(result).toContain(String.raw`color: var(--color-br\61nd)`)
      expect(result).toContain('--color-brand:')
      expect(transform(result)).toBe(result)
    })
  })

  it('Lynx 直接入口不能把注册属性误当可跨元素替换的普通 token', () => {
    const css = '@property --color-brand { syntax: "<color>"; inherits: false; initial-value: #00f; } :root { --color-brand: #f00; } .probe { color: var(--color-brand); }'
    expect(transformLynxCssCompat(css)).toContain('color: var(--color-brand)')
  })
})
