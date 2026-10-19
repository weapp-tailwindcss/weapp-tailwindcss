import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/postcss-runtime', () => {
  throw new Error('原生值运行时禁止加载 PostCSS 编译入口')
})

describe('独立原生值运行时入口', () => {
  it('不加载 PostCSS 编译器，并按变量声明的来源解析默认值', async () => {
    const { resolveNativeBoxShadow } = await import('../src/native-runtime')
    expect(resolveNativeBoxShadow({ value: '0 1px var(--color)', defaults: { '--color': 'red' } }, {
      '--color': { value: 'var(--brand)', defaults: { '--brand': 'blue' } },
    })).toEqual([{ offsetX: 0, offsetY: 1, blurRadius: 0, spreadDistance: 0, color: 'blue' }])
  })

  it('calc 保留优先级与长度量纲，非法、循环和未解析表达式不透传给宿主', async () => {
    const { resolveNativeBoxShadow } = await import('../src/native-runtime')
    const value = (source: string) => resolveNativeBoxShadow({ value: source, defaults: {} }, {})
    expect(value('calc(2px + 3px * 2) 0 calc(1rem / 2) -1px red')).toEqual([{ offsetX: 8, offsetY: 0, blurRadius: 8, spreadDistance: -1, color: 'red' }])
    for (const source of ['calc(1px + 2) 0 red', '1 2px red', '0 1px calc(1px / 0) red', '0 1px var(--missing)']) {
      expect(value(source)).toBeUndefined()
    }
    expect(resolveNativeBoxShadow({ value: '0 1px var(--a)', defaults: { '--a': 'var(--b)', '--b': 'var(--a)' } }, {})).toBeUndefined()
  })
})
