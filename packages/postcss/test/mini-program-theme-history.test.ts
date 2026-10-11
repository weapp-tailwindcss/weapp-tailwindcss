import postcss from 'postcss'
import { expect, it } from 'vitest'
import { finalizeMiniProgramCss } from '../src/compat/mini-program-css/finalize'
import { applyConfiguredCssCalc } from '../src/transform'

it.each([
  ['1rpx', '1rpx', '32rpx', ['1rpx']],
  ['1rpx', '2rpx', 'calc(var(--spacing)*32)', ['1rpx', '2rpx']],
])('归并主题保留冲突且可重复收尾：%s → %s', async (first, second, expected, history) => {
  const source = `:root,:host{--spacing:${first}} :root,:host{--spacing:${second}} .w-32{width:calc(var(--spacing)*32)}`
  const once = finalizeMiniProgramCss(source, { cssPreflight: false })
  const twice = finalizeMiniProgramCss(once, { cssPreflight: false })
  const values: string[] = []
  postcss.parse(twice).walkDecls('--spacing', decl => { values.push(decl.value) })
  expect(values).toEqual(history)
  const calculated = await applyConfiguredCssCalc(twice, { cssCalc: ['--spacing'] })
  const widths: string[] = []
  postcss.parse(calculated).walkDecls('width', decl => { widths.push(decl.value.replace(/\s+/g, '')) })
  expect(widths).toEqual([expected])
})

it('不同声明保留顺序与 important，不把 A/B/A 合并成 A/B', () => {
  const source = ':root,:host{--spacing:1rpx!important;--spacing:2rpx} :root,:host{--spacing:1rpx}'
  const css = finalizeMiniProgramCss(source, { cssPreflight: false })
  const values: string[] = []
  postcss.parse(css).walkDecls('--spacing', decl => { values.push(`${decl.value.trim()}${decl.important ? '!important' : ''}`) })
  expect(values).toEqual(['1rpx!important', '2rpx', '1rpx'])
})
