import { describe, expect, it } from 'vitest'
import { stripTailwindConfigDirectives } from '../src/generator-plugin/config-directive'

describe('Vite 预处理前的配置指令清理', () => {
  it.each([['\n', '\n\n'], ['\r\n', '\n']])('移除独占行的多个配置指令并保留原有空白：%j', (newline, remainingWhitespace) => {
    const source = ['@config "./first.js";', "@config './second.js';", '.card { color: red; }'].join(newline)
    expect(stripTailwindConfigDirectives(source)).toBe(`${remainingWhitespace}.card { color: red; }`)
  })

  it('保留尚未经过 Sass 编译的内容和未闭合样式', () => {
    const source = '@config "./theme.js";\n$color: red;\n.card { color: $color;'
    expect(stripTailwindConfigDirectives(source)).toBe('\n$color: red;\n.card { color: $color;')
  })

  it('保持原来的行级边界，不扩大到内联指令或字符串', () => {
    const source = '@config "./theme.js"; .card { color: red; }\n.label::before { content: \'@config "sample";\'; }'
    expect(stripTailwindConfigDirectives(source)).toBe(source)
  })

  it('只有配置指令时返回空内容，重复清理保持结果', () => {
    expect(stripTailwindConfigDirectives('  @config "./theme.js";\n')).toBe('')
    expect(stripTailwindConfigDirectives('')).toBe('')
    const css = '.card { color: red; }'
    expect(stripTailwindConfigDirectives(css)).toBe(css)
  })
})
