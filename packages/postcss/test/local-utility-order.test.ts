import { describe, expect, it } from 'vitest'
import { transformGeneratorUserCss } from '../src/compat/tailwindcss-v4/user-css/transform'
import { createLocalUtilityOrderPlan, UNI_APP_X_LOCAL_UTILITY_MARKER } from '../src/compat/uni-app-x/local-utility-order'
import { postcss } from '../src/postcss-runtime'

const marked = (name: string) => `/*${UNI_APP_X_LOCAL_UTILITY_MARKER} */ .${name}{@apply ${name};}`
function selectors(css: string) {
  const result: string[] = []
  postcss.parse(css).walkRules((rule) => {
    result.push(rule.selector)
  })
  return result
}

describe('local utility source ordering', () => {
  it.each([false, true])('consumes only owned comments during author replay (processed=%s)', async (processed) => {
    for (const generatorTarget of ['weapp', 'web']) {
      const output = await transformGeneratorUserCss(`/*! author */ /*${UNI_APP_X_LOCAL_UTILITY_MARKER} */ .author{color:red}`, {
        processed,
        generatorTarget,
        generatorStyleOptions: {},
        cssUserHandlerOptions: {},
        styleHandler: async css => ({ css }),
        importFallback: false,
      })
      expect(output).not.toContain(UNI_APP_X_LOCAL_UTILITY_MARKER)
      expect(output).toContain('/*! author */')
      expect(output).toContain('.author{color:red}')
    }
  })

  it.each([false, true])('repairs framework source fragments before marker parsing (processed=%s)', async (processed) => {
    for (const [source, expected] of [
      [`/*${UNI_APP_X_LOCAL_UTILITY_MARKER} */\n.author{color:red}\n}`, '.author{color:red}'],
      // 已处理来源的 source-media 块由既有生成指令清理整段移除。
      [`@media source(none){\n/*${UNI_APP_X_LOCAL_UTILITY_MARKER} */\n.author{color:red}`, processed ? '' : '.author{color:red}'],
    ] as const) {
      for (const generatorTarget of ['weapp', 'web']) {
        const output = await transformGeneratorUserCss(source, {
          processed,
          generatorTarget,
          generatorStyleOptions: {},
          cssUserHandlerOptions: {},
          styleHandler: async css => ({ css }),
          importFallback: false,
        })
        expect(output).not.toContain(UNI_APP_X_LOCAL_UTILITY_MARKER)
        expect(output.trim()).toBe(expected)
      }
    }
  })

  it('sorts only marked runs, with zero and tied ranks, inside each parent', () => {
    const css = `${marked('late')}${marked('first')}${marked('tie')}.author{color:red}@media (min-width:1px){${marked('late')}${marked('first')}}`
    const plan = createLocalUtilityOrderPlan(css)!
    expect(plan.candidates).toEqual(['late', 'first', 'tie'])
    const result = plan.apply(new Map([['late', 2n], ['first', 0n], ['tie', 0n]]))
    expect(selectors(result)).toEqual(['.first', '.tie', '.late', '.author', '.first', '.late'])
    expect(result).not.toContain(UNI_APP_X_LOCAL_UTILITY_MARKER)
    expect(result).toContain('@media (min-width:1px)')
    expect(result).toContain('.author{color:red}')
  })

  it('keeps missing and unknown candidates as stable boundaries', () => {
    const source = ['late', 'missing', 'first', 'late', 'unknown', 'late', 'first'].map(marked).join('')
    const plan = createLocalUtilityOrderPlan(source)!
    const output = plan.apply(new Map([['first', 0n], ['late', 3n], ['unknown', null]]))
    expect(selectors(output)).toEqual(['.late', '.missing', '.first', '.late', '.unknown', '.first', '.late'])
  })

  it('does not move generated rules across author rules, comments or layers', () => {
    const source = `${marked('late')}.manual{@apply manual;}/* author */${marked('first')}@layer base{${marked('late')}}${marked('first')}`
    expect(selectors(createLocalUtilityOrderPlan(source)!.apply(new Map([['first', 0n], ['late', 1n]]))))
      .toEqual(['.late', '.manual', '.first', '.late', '.first'])
  })

  it('consumes markers without promoting mixed author rules or requiring ranks', () => {
    const source = `/*${UNI_APP_X_LOCAL_UTILITY_MARKER} */.mixed{@apply first;color:red}${marked('late')}${marked('first')}/*${UNI_APP_X_LOCAL_UTILITY_MARKER} */`
    const plan = createLocalUtilityOrderPlan(source)!
    expect(plan.candidates).toEqual(['late', 'first'])
    const output = plan.apply(new Map())
    expect(selectors(output)).toEqual(['.mixed', '.late', '.first'])
    expect(output).not.toContain(UNI_APP_X_LOCAL_UTILITY_MARKER)
    expect(createLocalUtilityOrderPlan('.author{@apply late first;}')).toBeUndefined()
  })
})
