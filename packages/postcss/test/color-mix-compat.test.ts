import valueParser from 'postcss-value-parser'
import { normalizeModernColorValue, protectDynamicColorMixAlpha, protectDynamicVarFallbacks } from '../src/compat/color-mix'
import { createStyleHandler } from '../src/handler'
import { hasUnsupportedModernColorFunction, isDisplayP3ColorFunction } from '../src/compat/color-mix/modern'
import {
  normalizeColorFunctionName,
  normalizeStandaloneColorFunction,
  parseAlphaValue,
  resolveColorData,
  splitArguments,
  splitStopSegments,
  trimNodes,
} from '../src/compat/color-mix/parse'
import { tryResolveColorMix } from '../src/compat/color-mix/resolve'

describe('color-mix compatibility helpers', () => {
  it('parses color helper arguments and alpha values', () => {
    const parsed = valueParser('red, color-mix(in oklab, blue 50%, transparent), green')
    expect(splitArguments(parsed.nodes).map(nodes => valueParser.stringify(nodes).trim())).toEqual([
      'red',
      'color-mix(in oklab, blue 50%, transparent)',
      'green',
    ])
    expect(splitStopSegments(valueParser(' var(--color)  25% ').nodes).map(nodes => valueParser.stringify(nodes))).toEqual([
      'var(--color)',
      '25%',
    ])
    expect(valueParser.stringify(trimNodes(valueParser('  red  ').nodes))).toBe('red')
    expect(parseAlphaValue('50%')).toBe(0.5)
    expect(parseAlphaValue('0.25')).toBeUndefined()
    expect(parseAlphaValue('var(--alpha)')).toBeUndefined()
  })

  it('resolves colors from literals, transparent, custom property fallbacks, and recursion limits', () => {
    const customProperties = new Map([
      ['--brand', 'oklch(62.3% 0.214 259.815)'],
      ['--nested', 'var(--brand)'],
      ['--loop-a', 'var(--loop-b)'],
      ['--loop-b', 'var(--loop-a)'],
    ])

    expect(resolveColorData('transparent', customProperties)?.alpha).toBe(0)
    expect(resolveColorData('currentColor', customProperties)).toBeUndefined()
    expect(resolveColorData('inherit', customProperties)).toBeUndefined()
    expect(resolveColorData('var(--missing, #0ea5e9)', customProperties)).toBeUndefined()
    expect(resolveColorData('var(--nested)', customProperties)?.channels.length).toBe(3)
    expect(resolveColorData('var(--loop-a)', customProperties)).toBeUndefined()
    expect(normalizeColorFunctionName('var(--brand)', 0.4, customProperties)).toContain('rgba(')
    expect(normalizeStandaloneColorFunction('color(display-p3 0.26642 0.49122 0.98862)')).toContain('rgb(')
    expect(normalizeStandaloneColorFunction('not-a-color')).toBeUndefined()
  })

  it('detects and normalizes modern color functions without touching legacy values', () => {
    expect(isDisplayP3ColorFunction(' color(display-p3 1 0 0)')).toBe(true)
    expect(hasUnsupportedModernColorFunction('rgb(1 2 3 / .5)')).toBe(true)
    expect(hasUnsupportedModernColorFunction('rgb(1, 2, 3)')).toBe(false)

    expect(normalizeModernColorValue('oklch(62.3% 0.214 259.815)').value).toContain('rgb(')
    expect(normalizeModernColorValue('color(display-p3 0.26642 0.49122 0.98862)').value).toContain('rgb(')
    expect(normalizeModernColorValue('rgb(1 2 3 / .5)')).toMatchObject({
      value: 'rgba(1, 2, 3, 0.5)',
      changed: true,
      hasUnsupported: false,
    })
    expect(normalizeModernColorValue('color-mix(in oklab, currentColor 50%, transparent)')).toEqual({
      value: 'color-mix(in oklab, currentColor 50%, transparent)',
      changed: false,
      hasUnsupported: true,
    })
    expect(normalizeModernColorValue('linear-gradient(color-mix(in oklab, var(--missing) 50%, transparent), red)')).toEqual({
      value: 'linear-gradient(color-mix(in oklab, var(--missing) 50%, transparent), red)',
      changed: false,
      hasUnsupported: true,
    })
  })

  it('resolves static, dynamic, currentColor, and unresolved color-mix values', () => {
    const customProperties = new Map([
      ['--brand', '#0ea5e9'],
      ['--modern-brand', 'oklch(68.5% 0.169 237.323)'],
    ])

    function resolve(source: string) {
      const parsed = valueParser(source)
      const node = parsed.nodes.find(item => item.type === 'function')
      return node?.type === 'function' ? tryResolveColorMix(node, customProperties) : undefined
    }

    expect(resolve('color-mix(in oklab, var(--brand) 25%, transparent)')).toEqual({
      value: 'rgba(14, 165, 233, 0.25)',
      deferred: false,
    })
    expect(resolve('color-mix(in oklab, var(--brand) var(--alpha), transparent)')).toBeUndefined()
    expect(resolve('color-mix(in oklab, var(--modern-brand) var(--alpha), transparent)')).toBeUndefined()
    expect(resolve('color-mix(in oklab, var(--missing) var(--alpha), transparent)')).toBeUndefined()
    expect(resolve('color-mix(in oklab, currentColor 50%, transparent)')).toBeUndefined()
    expect(resolve('color-mix(in oklab, var(--brand) var(--tw-bg-alpha), transparent)')).toBeUndefined()
    expect(resolve('color-mix(in oklab, var(--brand) 50%, white)')).toBeUndefined()
    expect(resolve('color-mix(in oklab, var(--brand), transparent)')).toBeUndefined()
    expect(resolve('color-mix(in oklab, red 50%)')).toBeUndefined()
    expect(resolve('color-mix(in oklab, red, transparent)')).toBeUndefined()
    expect(resolve('color-mix(in oklab, red var(--alpha), blue)')).toBeUndefined()
    expect(resolve('color-mix(in oklab, red calc(1px), transparent)')).toBeUndefined()
    expect(resolve('color-mix(in oklab, red 50%, transparent)')).toEqual({
      value: 'rgba(255, 0, 0, 0.5)',
      deferred: false,
    })
  })

  it('preserves dynamic color-mix alpha and its supports condition', () => {
    const protectedCss = protectDynamicColorMixAlpha([
      ':root{--brand:#0ea5e9}',
      '@supports (color: color-mix(in oklab, red, red)){',
      '  .card{color:color-mix(in oklab, var(--brand) var(--alpha), transparent)}',
      '}',
    ].join('\n'))

    expect(protectedCss.css).toContain('color-mix(in oklab, var(--brand) var(--alpha), transparent)')
    expect(protectedCss.css).toContain('@supports')
    expect(protectedCss.restore(protectedCss.css)).toContain('color-mix(in oklab, var(--brand) var(--alpha), transparent)')

    const unchanged = protectDynamicColorMixAlpha('.card{color:red}')
    expect(unchanged.css).toBe('.card{color:red}')
    expect(unchanged.restore('x')).toBe('x')
  })

  it('protects dynamic color-mix values without supports wrappers and leaves unresolved values intact', () => {
    const protectedCss = protectDynamicColorMixAlpha([
      ':root{--brand:#0ea5e9}',
      '.dynamic{color:color-mix(in oklab, var(--brand) var(--alpha), transparent)}',
      '.unresolved{color:color-mix(in oklab, var(--missing) 50%, transparent)}',
      '.nested{filter:blur(color-mix(in oklab, red 50%, transparent))}',
    ].join('\n'))

    expect(protectedCss.css).toContain('color-mix(in oklab, var(--brand) var(--alpha), transparent)')
    expect(protectedCss.css).toContain('var(--missing)')
    expect(protectedCss.css).toContain('rgba(255, 0, 0, 0.5)')
    expect(protectedCss.restore(protectedCss.css)).toContain('color-mix(in oklab, var(--brand) var(--alpha), transparent)')
  })

  it('preserves author variable fallbacks without shielding Tailwind theme variables', async () => {
    const source = [
      '.bg-primary{background-color:var(--theme-color, #0957DE)}',
      '.text-xs{font-size:var(--text-xs, 0.75rem)}',
      '.text-white{color:var(--color-white, #fff)}',
    ].join('')
    const protectedCss = protectDynamicVarFallbacks(source)

    expect(protectedCss.css).toContain('__weapp_tw_var_fallback_0__')
    expect(protectedCss.css).toContain('var(--text-xs, 0.75rem)')
    expect(protectedCss.css).toContain('var(--color-white, #fff)')
    expect(protectedCss.restore(protectedCss.css)).toBe(source)

    const result = await createStyleHandler({
      majorVersion: 4,
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      cssPresetEnv: {
        features: {
          'custom-properties': { preserve: false },
        },
      },
    })(source)
    expect(result.css).toContain('background-color:#0957DE;background-color:var(--theme-color)')
    expect(result.css).toContain('font-size:0.75rem')
    expect(result.css).toContain('color:#fff')
    expect(result.css).not.toContain('var(--text-xs')
    expect(result.css).not.toContain('var(--color-white')
  })

})
