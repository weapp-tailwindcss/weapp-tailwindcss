import type { IStyleHandlerOptions } from '@/types'
import { createStyleHandler } from '@/handler'
import { applyConfiguredCssCalc } from '@/plugins/applyConfiguredCssCalc'
import { analyzeCssCalcContext } from '@/utils/css-calc-context'

const utility = '.w-32 { width: calc(var(--spacing, 9rpx) * 32) }'
const dynamicBase = '@media (min-width: 500px) { :root { --base: 2rpx } }'
const entries = [
  ['eager', async (css: string, options: Partial<IStyleHandlerOptions>) => (await createStyleHandler(options)(css)).css],
  ['deferred', applyConfiguredCssCalc],
] as const
const configurations = [
  ['顶层 Map', (values: Map<string, string>) => ({ cssCalc: ['--spacing'], customPropertyValues: values })],
  ['cssCalc 对象 Map', (values: Map<string, string>) => ({ cssCalc: { includeCustomProperties: ['--spacing'], customPropertyValues: values } })],
  ['嵌套 cssCalc 对象 Map', (values: Map<string, string>) => ({ cssOptions: { cssCalc: { includeCustomProperties: ['--spacing'], customPropertyValues: values } } })],
] as const

describe.each(entries)('%s 显式值的源码依赖边界', (_, transform) => {
  describe.each(configurations)('%s', (_, configure) => {
    it.each([
      ['直接依赖的条件覆盖', `:root { --spacing: var(--base); --base: 1rpx } ${dynamicBase}`],
      ['传递依赖的条件覆盖', `:root { --spacing: var(--step); --step: var(--base); --base: 1rpx } ${dynamicBase}`],
      ['带 fallback 的动态依赖', `:root { --spacing: var(--base, 5rpx); --base: 1rpx } ${dynamicBase}`],
      ['传递 fallback 的动态依赖', `:root { --spacing: var(--step, 5rpx); --step: var(--base, 3rpx); --base: 1rpx } ${dynamicBase}`],
      ['未解析的 fallback 依赖', ':root { --spacing: var(--missing, 5rpx) }'],
      ['循环依赖', ':root { --spacing: var(--base); --base: var(--spacing) }'],
      ['继承值', ':root { --spacing: inherit }'],
    ])('不能用显式常量掩盖%s', async (_, source) => {
      const css = await transform(`${source} ${utility}`, configure(new Map([['--spacing', '1rpx']])))
      expect(css).toMatch(/width:\s*calc\(var\(--spacing,\s*9rpx\)\s*\*\s*32\)/)
      expect(css).not.toMatch(/width:\s*(?:32|64|96|160|288)rpx/)
    })

    it('仍支持无源码声明的显式值和源码缺失依赖的显式补值', async () => {
      const direct = await transform(utility, configure(new Map([['--spacing', '3rpx']])))
      expect(direct).toMatch(/width:\s*96rpx/)

      const alias = await transform(`:root { --spacing: var(--base) } ${utility}`, configure(new Map([['--base', '2rpx']])))
      expect(alias).toMatch(/width:\s*64rpx/)
    })

    it('保留固定别名上的显式值优先级', async () => {
      const css = await transform(`:root { --spacing: var(--base); --base: 1rpx } ${utility}`, configure(new Map([['--spacing', '3rpx']])))
      expect(css).toMatch(/width:\s*96rpx/)
    })
  })
})

it('显式映射的新增依赖同样参与安全分析', () => {
  const source = `:root { --spacing: 1rpx; --base: 1rpx } ${dynamicBase}`
  const context = analyzeCssCalcContext(source, new Map([['--spacing', 'var(--base)']]))
  expect(context.customPropertyValues.has('--spacing')).toBe(false)
})
