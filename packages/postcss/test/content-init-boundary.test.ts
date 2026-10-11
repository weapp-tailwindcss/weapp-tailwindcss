import { describe, expect, it } from 'vitest'
import { postcss, pruneMiniProgramGeneratedCss, removeUnusedMiniProgramContentInit } from '../src'

describe('generated content initialization boundary', () => {
  it('preserves the root preflight initialization contract without local consumers', () => {
    expect(pruneMiniProgramGeneratedCss('.utility{display:flex}', { preservePreflight: true }))
      .toContain('--tw-content:""')
  })

  it.each([
    'view,text,::after,::before{--tw-content:""}.card{display:flex}',
    '::before,::after{--tw-content:""}.card{display:flex}',
  ])('removes orphan initialization only during explicit post-coverage cleanup: %s', (css) => {
    const root = postcss.parse(css)
    expect(removeUnusedMiniProgramContentInit(root)).toBe(true)
    expect(root.toString()).toBe('.card{display:flex}')
  })

  it('retains other preflight declarations', () => {
    const root = postcss.parse('view,text,::after,::before{--tw-content:"";box-sizing:border-box}')
    expect(removeUnusedMiniProgramContentInit(root)).toBe(true)
    expect(root.toString()).toBe('view,text,::after,::before{box-sizing:border-box}')
  })

  it('preserves defaults when a content consumer remains', () => {
    const css = 'view,text,::after,::before{--tw-content:""}.card::before{content:var(--tw-content)}'
    const root = postcss.parse(css)
    expect(removeUnusedMiniProgramContentInit(root)).toBe(false)
    expect(root.toString()).toBe(css)
  })

  it('preserves authored class declarations without consumers', () => {
    const css = '.card{--tw-content:""}'
    const root = postcss.parse(css)
    expect(removeUnusedMiniProgramContentInit(root)).toBe(false)
    expect(root.toString()).toBe(css)
  })
})
