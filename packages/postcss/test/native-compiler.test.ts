import { compileNativeCss } from '@/native'

describe('独立 Native CSS 编译入口', () => {
  it('只处理精确 classSet，保留变量、声明顺序和 important', () => {
    const result = compileNativeCss(`
      :root { --spacing: 0.25rem; }
      .unknown { width: 20px; }
      .p-4 { padding-inline: calc(var(--spacing) * 4); color: red !important; }
      .p-4 { width: 10px; }
    `, { classSet: new Set(['p-4']) })
    expect(result.variables).toEqual({ '--spacing': '0.25rem' })
    expect(result.rules).toEqual({
      'p-4': [
        { style: { paddingHorizontal: 16 }, important: undefined, order: 0 },
        { style: { color: 'red' }, important: true, order: 0 },
        { style: { width: 10 }, important: undefined, order: 1 },
      ],
    })
    expect(result.warnings).toEqual([])
    expect(result).not.toHaveProperty('styleSheet')
  })

  it('保持不支持的属性与变体告警顺序和去重', () => {
    const result = compileNativeCss(`
      .blur { filter: blur(4px); filter: blur(4px); }
      .hover\\:flex { display: flex; }
      .dark\\:ios\\:flex { display: flex; }
    `)
    expect(result.warnings).toEqual([
      expect.objectContaining({ className: 'blur', property: 'filter' }),
      expect.objectContaining({ className: 'hover:flex', property: 'variant' }),
    ])
    expect(result.rules['dark:ios:flex']?.[0]).toMatchObject({
      colorScheme: 'dark', platform: 'ios', style: { display: 'flex' },
    })
  })

  it('相邻选择器与后续调用的结果独立', () => {
    const first = compileNativeCss('.a, .b { transform: translateX(4px); }')
    const second = compileNativeCss('.a { transform: translateX(4px); }')
    const transform = first.rules.a![0]!.style.transform as { translateX: number }[]
    transform[0]!.translateX = 99
    expect(first.rules.b![0]!.style.transform).toEqual([{ translateX: 4 }])
    expect(second.rules.a![0]!.style.transform).toEqual([{ translateX: 4 }])
  })

  it('保留空输入与非法 CSS 的原有契约', () => {
    expect(compileNativeCss('')).toEqual({ rules: {}, variables: {}, warnings: [] })
    expect(() => compileNativeCss('.a {')).toThrow()
  })
})
