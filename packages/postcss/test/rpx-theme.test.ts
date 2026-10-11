import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { collectRpxThemeVariables, inspectRpxCalcUsage } from '../src/diagnostics/rpx-theme'
import { collectCustomPropertyValues, mergeCustomPropertyValues } from '../src/utils/custom-property-values'

describe('rpx theme diagnostics', () => {
  afterEach(() => vi.restoreAllMocks())

  it('recognizes dimensions in theme blocks without treating text as CSS units', () => {
    const source = `
      .ordinary { --ignored: 1rpx }
      @theme { --spacing: 1rpx; --gap: 3rpx; --padding: 2rpx }
      @theme inline {
        --small: -.5rpx; --large: 1e2rpx; --nested: calc(1 * 3rpx);
        --text: "1rpx"; --url: url(1rpx); --comment: 1px /* 3rpx */;
        --not-a-unit: rpx; --px: 4px;
      }
    `
    expect(collectRpxThemeVariables(source)).toEqual([
      '--spacing', '--gap', '--padding', '--small', '--large', '--nested',
    ])
  })

  it('only tracks variable references inside calc, including nested fallbacks', () => {
    const usage = inspectRpxCalcUsage(`
      .a { margin: var(--gap) calc(var(--spacing) * 8) }
      .b { width: calc(var(--unknown, var(--padding)) * 3); height: CALC(3rpx * 8) }
      .c { content: "calc(1rpx * 8)"; background: url("calc(1rpx)") }
    `, new Set(['--spacing', '--gap', '--padding']))
    expect(usage).toEqual({ variables: ['--spacing', '--padding'], inlineRpx: true })
    expect(inspectRpxCalcUsage('.a { width: 24rpx }', new Set(['--spacing'])))
      .toEqual({ variables: [], inlineRpx: false })
    expect(inspectRpxCalcUsage('.a { width: calc(1px * 8); margin: var(--spacing) }', new Set(['--spacing'])))
      .toEqual({ variables: [], inlineRpx: false })
  })

  it('does not turn malformed CSS into a positive or safe diagnosis', () => {
    expect(collectRpxThemeVariables('@theme { --spacing: 1rpx')).toEqual([])
    expect(inspectRpxCalcUsage('.a { width: calc(1rpx * 8)', new Set())).toBeUndefined()
  })

  it('recognizes compact multiplication and division', () => {
    expect(collectRpxThemeVariables('@theme inline { --spacing: calc(3rpx*8) }')).toEqual(['--spacing'])
    expect(inspectRpxCalcUsage('.a{width:calc(3rpx*8);height:calc(2rpx/2)}', new Set()))
      .toEqual({ variables: [], inlineRpx: true })
  })

  it('skips parsing irrelevant large styles and static outputs', () => {
    const parse = vi.spyOn(postcss, 'parse')
    const css = '.a { color: red; width: 8rpx }'.repeat(10_000)
    expect(collectRpxThemeVariables(css)).toEqual([])
    expect(inspectRpxCalcUsage(css, new Set(['--spacing']))).toEqual({ variables: [], inlineRpx: false })
    expect(collectCustomPropertyValues(css).size).toBe(0)
    expect(parse).not.toHaveBeenCalled()
  })
})

describe('shared custom property context', () => {
  it('merges declarations in order, preserving the existing collection semantics', () => {
    const values = collectCustomPropertyValues('@theme { --spacing: 1rpx } .local { --spacing: 3rpx; color: red }')
    mergeCustomPropertyValues(values, ':root { --gap: 2rpx; --spacing: 4rpx }')
    expect([...values]).toEqual([['--spacing', '4rpx'], ['--gap', '2rpx']])
    mergeCustomPropertyValues(values, ':root { --spacing: 7rpx;')
    expect(values.get('--spacing')).toBe('4rpx')
  })
})
