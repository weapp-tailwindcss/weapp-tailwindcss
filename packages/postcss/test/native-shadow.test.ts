import { describe, expect, it } from 'vitest'
import { compileNativeCss } from '../src/native'

describe('原生完整 boxShadow 编码', () => {
  it('独立保留每层的偏移、模糊、spread、颜色与 inset', () => {
    const result = compileNativeCss(`
      .shadow { box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1), inset 2px -4px 6px 1px rgba(255, 0, 0, 0.25); }
    `)
    expect(result.rules.shadow?.[0]?.style).toEqual({
      boxShadow: [
        { offsetX: 0, offsetY: 10, blurRadius: 15, spreadDistance: -3, color: 'rgb(0 0 0 / 0.1)' },
        { offsetX: 2, offsetY: -4, blurRadius: 6, spreadDistance: 1, color: 'rgba(255, 0, 0, 0.25)', inset: true },
      ],
    })
    expect(result.warnings).toEqual([])
  })

  it('从属性初始值与当前 utility 变量展开 Tailwind 阴影，不受其他 utility 污染', () => {
    const result = compileNativeCss(`
      @property --tw-inset-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
      @property --tw-ring-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
      .shadow-lg {
        --tw-shadow: 0 10px 15px -3px var(--tw-shadow-color, rgb(0 0 0 / 0.1)), 0 4px 6px -4px var(--tw-shadow-color, rgb(0 0 0 / 0.1));
        box-shadow: var(--tw-inset-shadow), var(--tw-ring-shadow), var(--tw-shadow);
      }
      .ring-2 { --tw-ring-shadow: 0 0 0 2px blue; box-shadow: var(--tw-ring-shadow); }
      .inset-shadow { --tw-inset-shadow: inset 0 2px 4px red; box-shadow: var(--tw-inset-shadow); }
    `)
    expect(result.rules['shadow-lg']?.[0]?.style).toEqual({
      boxShadow: [
        { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 0, color: '#0000' },
        { offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 0, color: '#0000' },
        { offsetX: 0, offsetY: 10, blurRadius: 15, spreadDistance: -3, color: 'rgb(0 0 0 / 0.1)' },
        { offsetX: 0, offsetY: 4, blurRadius: 6, spreadDistance: -4, color: 'rgb(0 0 0 / 0.1)' },
      ],
    })
    expect(result.variables).not.toHaveProperty('--tw-shadow')
    expect(result.variables['--tw-ring-shadow']).toBe('0 0 #0000')
    expect(result.warnings).toEqual([])
  })

  it('支持 none、rem、颜色前置、规则内后声明变量，并拒绝无效或不支持的阴影', () => {
    const result = compileNativeCss(`
      .none { box-shadow: none; }
      .local { box-shadow: var(--shadow); --shadow: red 0 0.5rem; }
      .invalid { box-shadow: 0 1px -2px red; }
      .percent { box-shadow: 0 10% red; }
      .unresolved { box-shadow: var(--missing); }
      .interleaved { box-shadow: 0 red 1px; }
    `)
    expect(result.rules.none?.[0]?.style).toEqual({ boxShadow: [] })
    expect(result.rules.local?.[0]?.style).toEqual({ boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 0, spreadDistance: 0, color: 'red' }] })
    expect(result.warnings.map(item => item.className)).toEqual(['invalid', 'percent', 'unresolved', 'interleaved'])
  })

  it('宿主禁用 boxShadow 时明确诊断，不降级丢失 spread 或阴影层', () => {
    const result = compileNativeCss('.shadow { box-shadow: 0 1px 2px 3px red, inset 1px 0 blue; }', { boxShadow: false })
    expect(result.rules).toEqual({})
    expect(result.warnings).toEqual([expect.objectContaining({ className: 'shadow', property: 'boxShadow', message: expect.stringContaining('宿主') })])
  })

  it('局部变量、后代变量及条件根变量不会污染其他规则', () => {
    const result = compileNativeCss(`
      :root { --size: 8px; }
      @media (prefers-color-scheme: dark) { :root { --size: 90px; } }
      .a { width: var(--size); --size: 12px; .child { --size: 99px; height: var(--size); } }
      .b { width: var(--size); }
    `)
    expect(result.rules.a?.[0]?.style).toEqual({ width: 12 })
    expect(result.rules.b?.[0]?.style).toEqual({ width: 8 })
    expect(result.rules.child?.[0]?.style).toEqual({ height: 99 })
    expect(result.variables).toEqual({ '--size': '8px' })
  })
})
