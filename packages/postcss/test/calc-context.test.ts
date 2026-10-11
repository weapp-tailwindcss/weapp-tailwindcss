import type { IStyleHandlerOptions } from '@/types'
import { createStyleHandler } from '@/handler'

describe('calc external variable configuration', () => {
  it.each([
    ['array', ['--scale']],
    ['regexp', [/^--scale$/]],
    ['object', { includeCustomProperties: ['--scale'] }],
    ['boolean', true],
  ] as const)('resolves mapped values with %s options at both entry points', async (_, cssCalc) => {
    for (const nested of [false, true]) {
      const handler = createStyleHandler({
        ...(nested ? { cssOptions: { cssCalc } } : { cssCalc }),
        customPropertyValues: new Map([['--scale', '3rpx']]),
      } as Partial<IStyleHandlerOptions>)
      const { css } = await handler('.x { gap: calc(var(--scale) * 2); padding: calc(var(--other) * 2) }')
      expect(css).toContain('gap: 6rpx')
      expect(css).toMatch(/padding: calc\(var\(--other\)\s*\*\s*2\)/)
    }
  })
})


describe('calc context cache identity', () => {
  it('invalidates cached CSS when a reused value Map changes', async () => {
    const customPropertyValues = new Map([['--scale', '1rpx']])
    const handler = createStyleHandler({ cssCalc: ['--scale'], customPropertyValues })
    const source = '.x { width: calc(var(--scale) * 32) }'
    expect((await handler(source)).css).toContain('width: 32rpx')
    customPropertyValues.set('--scale', '2rpx')
    expect((await handler(source)).css).toContain('width: 64rpx')
    customPropertyValues.delete('--scale')
    expect((await handler(source)).css).toContain('var(--scale)')
  })

  it('separates regex source and flags and rechecks mutated override arrays', async () => {
    const handler = createStyleHandler({ customPropertyValues: new Map([['--scale', '2rpx']]) })
    const source = '.x { width: calc(var(--scale) * 32) }'
    const override = { cssCalc: [/^--scale$/] }
    expect((await handler(source, override)).css).toContain('width: 64rpx')
    override.cssCalc = [/^--other$/]
    expect((await handler(source, override)).css).toContain('var(--scale)')
    expect((await handler(source, { cssCalc: [/^--SCALE$/] })).css).toContain('var(--scale)')
    expect((await handler(source, { cssCalc: [/^--SCALE$/i] })).css).toContain('width: 64rpx')
  })
})


it('does not reuse a cache entry whose original mutable inputs have drifted', async () => {
  const handler = createStyleHandler({ cssCalc: ['--scale'] })
  const source = '.x { width: calc(var(--scale) * 32) }'
  const values = new Map([['--scale', '1rpx']])
  expect((await handler(source, { customPropertyValues: values })).css).toContain('width: 32rpx')
  values.set('--scale', '2rpx')
  expect((await handler(source, { customPropertyValues: values })).css).toContain('width: 64rpx')
  expect((await handler('.y { width: calc(var(--scale) * 32) }', {
    customPropertyValues: new Map([['--scale', '1rpx']]),
  })).css).toContain('width: 32rpx')
})
