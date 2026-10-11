import { postcss } from '@weapp-tailwindcss/postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveGenerationStyleContext } from '@/tailwindcss/v4-engine/generator/style-context'

describe('generation style context', () => {
  afterEach(() => vi.restoreAllMocks())

  it.each([undefined, {}, { cssCalc: false }, { cssCalc: [] }, { cssCalc: { precision: 2 } }])('does not parse full CSS without variable consumers: %j', (options) => {
    const parse = vi.spyOn(postcss, 'parse')
    expect(resolveGenerationStyleContext(':root { --scale: 1rem }', '.x { gap: calc(var(--scale) * 2) }', options)).toBe(options)
    expect(parse).not.toHaveBeenCalled()
  })

  it.each([true, ['--scale'], [/^--scale$/], { includeCustomProperties: ['--scale'] }])('retains selected variable context: %j', (cssCalc) => {
    const options = resolveGenerationStyleContext(':root { --scale: 1rem }', ':root { --scale: 2rem; --other: 4px }', { cssCalc })
    expect(options?.customPropertyContextCss).toContain(':root { --scale: 1rem }')
    expect(options?.customPropertyContextCss).toContain(':root { --scale: 2rem; --other: 4px }')
    expect(options?.customPropertyValues).toBeUndefined()
  })

  it('honors nested calc and preserves explicitly provided values', () => {
    const values = new Map([['--scale', '3rem']])
    const options = resolveGenerationStyleContext(':root { --scale: 1rem }', ':root { --scale: 2rem }', {
      cssCalc: false, cssOptions: { cssCalc: ['--scale'] }, customPropertyValues: values,
    })
    expect(options?.customPropertyValues?.get('--scale')).toBe('3rem')
    expect(options?.customPropertyValues).toBe(values)
    expect(options?.customPropertyContextCss).toContain(':root { --scale: 2rem }')
    expect(values.size).toBe(1)
  })
})
