import { describe, expect, it, vi } from 'vitest'
import { compileTailwindAuthorFunctions, createTailwindAuthorFunctionProbe } from '../src/compat/tailwindcss-v4/author-functions'

describe('Tailwind author function values', () => {
  it('preserves duplicate declarations, scopes and quoted literals', async () => {
    const compile = vi.fn(async (values: string[]) => {
      expect(values).toEqual(["theme('spacing.2')", "(width > theme('screens.sm'))", '--spacing(3)'])
      return ['0.5rem', '(width > 40rem)', 'calc(var(--spacing) * 3)']
    })
    const result = await compileTailwindAuthorFunctions(`.x{padding:7px;padding:theme('spacing.2');content:"theme('fake')"}@media (width > theme('screens.sm')){.x{padding:--spacing(3)}}`, compile)
    expect(result).toBe(`.x{padding:7px;padding:0.5rem;content:"theme('fake')"}@media (width > 40rem){.x{padding:calc(var(--spacing) * 3)}}`)
    expect(compile).toHaveBeenCalledOnce()
  })

  it('does not compile comments or quoted content', async () => {
    const compile = vi.fn()
    const css = '/* theme(fake) */.x{content:"--alpha(fake)"}'
    expect(await compileTailwindAuthorFunctions(css, compile)).toBe(css)
    expect(compile).not.toHaveBeenCalled()
  })

  it('rejects missing or unresolved compiler output', async () => {
    await expect(compileTailwindAuthorFunctions('.x{padding:theme(a)}', async () => [])).rejects.toThrow('数量不匹配')
    await expect(compileTailwindAuthorFunctions('.x{padding:theme(a)}', async () => ['theme(a)'])).rejects.toThrow('尚未编译')
    const probe = createTailwindAuthorFunctionProbe(['theme(a)'], '.unique')
    expect(probe.read('.other{--value-0:red}.unique{--value-0:blue}')).toEqual(['blue'])
    expect(() => probe.read('.other{--value-0:red}')).toThrow('缺少')
  })
})
