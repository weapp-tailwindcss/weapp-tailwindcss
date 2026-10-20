import { describe, expect, it } from 'vitest'
import { removeWebpackTailwindGeneratedAssetCss } from '../src/compat/webpack-css/generated-cleanup'

describe('webpack 重新生成前的旧样式清理', () => {
  it('清理混合条件分组内的生成规则，并保留同组业务规则', () => {
    const source = String.raw`@layer utilities {
      @supports (color: color-mix(in lab, red, red)) {
        .bg-white\/80 { background-color: color-mix(in oklab, var(--color-white) 80%, #0000) }
        .dark\:bg-slate-900\/75:where([data-theme=dark], [data-theme=dark] *) { background-color: #0f172bbf }
        .site-panel { color: var(--panel-ink) }
      }
    }`
    const output = removeWebpackTailwindGeneratedAssetCss(source)
    expect(output).not.toContain('.bg-white')
    expect(output).not.toContain('.dark')
    expect(output).toContain('@layer utilities')
    expect(output).toContain('@supports (color: color-mix(in lab, red, red))')
    expect(output).toContain('.site-panel { color: var(--panel-ink) }')
  })

  it('遍历多层条件，仅移除生成叶子和因清理而空的容器', () => {
    const source = String.raw`@layer utilities {
      @media (width > 600px) {
        @supports (color: color-mix(in lab, red, red)) {
          .bg-white\/80 { background-color: #fffc }
        }
        @container panel (width > 400px) {
          .bg-white\/80 { background-color: #fffc }
          .site-panel { display: grid }
        }
      }
    }`
    const output = removeWebpackTailwindGeneratedAssetCss(source)
    expect(output).not.toContain('.bg-white')
    expect(output).not.toContain('@supports')
    expect(output).toContain('@media (width > 600px)')
    expect(output).toContain('@container panel (width > 400px)')
    expect(output).toContain('.site-panel { display: grid }')
  })

  it('保留非生成 layer 内同名基础规则和业务条件分组', () => {
    const source = String.raw`@layer components { @supports (display: grid) { .bg-white\/80 { background: blue } } }
@supports (display: grid) { .site-panel { color: red } }`
    expect(removeWebpackTailwindGeneratedAssetCss(source)).toBe(source)
  })

  it('不把外层的生成归属继承给嵌套业务 layer', () => {
    const source = String.raw`@layer utilities { @supports (display: grid) {
      .bg-white\/80 { background: #fffc }
      @layer business { .bg-white\/80 { background: blue } }
    } }`
    const output = removeWebpackTailwindGeneratedAssetCss(source)
    expect(output).not.toContain('background: #fffc')
    expect(output).toContain('@layer business { .bg-white\\/80 { background: blue } }')
  })
})
