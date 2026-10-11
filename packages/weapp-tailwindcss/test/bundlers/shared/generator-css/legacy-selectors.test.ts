import { describe, expect, it } from 'vitest'
import {
  collectDedupedPostTransformCompatCss,
  collectGeneratedSelectors,
  normalizeCompatSelectors,
  removeDuplicatedViteMarkers,
  removeGeneratedSelectorCompatCss,
} from '@/generation/legacy-selectors'

describe('legacy selector compatibility helpers', () => {
  it('normalizes escaped selectors and ignores theme-only custom property rules', () => {
    expect(normalizeCompatSelectors('.w-\\[100px\\]:not(#\\#)')).toEqual([
      '.w-\\[100px\\]',
      '.w-_b100px_B',
    ])
    expect(normalizeCompatSelectors('   ')).toEqual([])

    const selectors = collectGeneratedSelectors([
      ':host,page{--color-red-500:red}',
      '.w-_b100px_B{width:100px}',
      '::before{--tw-content:""}',
    ].join('\n'))

    expect(selectors.has('.w-_b100px_B')).toBe(true)
    expect(selectors.has(':host')).toBe(false)
    expect(selectors.has('::before')).toBe(true)
    expect(collectGeneratedSelectors('.broken{').size).toBe(0)

    for (let index = 0; index < 70; index++) {
      collectGeneratedSelectors(`.cache-${index}{color:red}`)
    }
    expect(collectGeneratedSelectors('.cache-final{color:red}').has('.cache-final')).toBe(true)
  })

  it('removes compat selectors already generated while preserving custom properties', () => {
    const css = removeGeneratedSelectorCompatCss([
      '.w-\\[100px\\]{width:100px}',
      '.keep{color:red}',
      ':root{--token:1}',
      '::before{--tw-content:""}',
    ].join('\n'), '.w-_b100px_B{width:100px}')

    expect(css).not.toContain('.w-\\[100px\\]')
    expect(css).toContain('.keep')
    expect(css).toContain('--token')
    expect(css).not.toContain('--tw-content')
    expect(removeGeneratedSelectorCompatCss('.keep{color:red}', '.broken{')).toBe('.keep{color:red}')
    expect(removeGeneratedSelectorCompatCss('.broken{', '.keep{color:red}')).toBe('.broken{')
  })

  it('dedupes post-transform compat declarations by selector and prop', () => {
    const css = collectDedupedPostTransformCompatCss([
      '.card{color:red;background:white}',
      '.card:hover{color:blue}',
      '.keep{display:flex}',
      ':root{--a:1;--b:2}',
    ].join('\n'), [
      '.card{color:red}',
      ':root{--a:1}',
    ].join('\n'))

    expect(css).not.toContain('.card{color:red;background:white}')
    expect(css).toContain('.card:hover')
    expect(css).toContain('.keep')
    expect(css).toContain('--a:1')
    expect(css).toContain('--b:2')
    expect(collectDedupedPostTransformCompatCss('.keep{color:red}', '.missing{color:red}')).toBe('.keep{color:red}')
    expect(collectDedupedPostTransformCompatCss('.broken{', '.keep{color:red}')).toBe('.broken{')
  })

  it('dedupes post-transform compat rules with legacy pseudo-element selectors', () => {
    const css = collectDedupedPostTransformCompatCss(
      '.before_ccontent-_b_aindependent_subpackage_mpx-tailwindcss-v4_a_B:before{--tw-content:"independent subpackage mpx-tailwindcss-v4";content:var(--tw-content)}',
      '.before_ccontent-_b_aindependent_subpackage_mpx-tailwindcss-v4_a_B::before{--tw-content:\'independent subpackage mpx-tailwindcss-v4\';content:var(--tw-content)}',
    )

    expect(css).toBe('')
  })

  it('preserves only uncovered custom property declarations for duplicated selectors', () => {
    const css = collectDedupedPostTransformCompatCss([
      '.token{--tw-a:1;--tw-b:2;--tw-c:3}',
      '.plain{--tw-a:1}',
      '.no-decls{}',
    ].join('\n'), [
      '.token{--tw-a:1;--tw-b:2}',
      '.plain{--tw-z:9}',
    ].join('\n'))

    expect(css).not.toContain('.token')
    expect(css).not.toContain('.plain')
    expect(css).toContain('.no-decls')
  })

  it('keeps malformed escaped selectors conservative', () => {
    expect(normalizeCompatSelectors('.foo\\')).toEqual(['.foo\\', '.foo_r'])
    expect(collectGeneratedSelectors('.foo\\{color:red}').size).toBe(0)
  })

  it('removes duplicated custom property utility selectors', () => {
    const css = collectDedupedPostTransformCompatCss([
      ':host,.tw-token{--tw-a:1;--tw-b:2;--tw-c:3}',
      'page,.tw-empty{--tw-a:1}',
    ].join('\n'), [
      ':host,.tw-token{--tw-a:1;--tw-b:2;--tw-c:3}',
      'page,.tw-empty{--tw-a:1}',
    ].join('\n'))

    expect(css).toBe('')
  })

  it('preserves uncovered custom properties when generated selector covers only some props', () => {
    const css = collectDedupedPostTransformCompatCss([
      '::before{--tw-content:"";--tw-extra:1}',
      '::after{--tw-content:""}',
    ].join('\n'), [
      '::before{--tw-content:""}',
      '::after{--tw-content:""}',
    ].join('\n'))

    expect(css).toContain('::before')
    expect(css).not.toContain('--tw-content')
    expect(css).toContain('--tw-extra:1')
    expect(css).not.toContain('::after')
  })

  it('removes duplicated Vite markers only when base css has markers', () => {
    const css = '/*$vite$:style.css*/\n.card{display:flex}'

    expect(removeDuplicatedViteMarkers(css, '.base{}')).toBe(css)
    expect(removeDuplicatedViteMarkers(css, '/*$vite$:style.css*/\n.base{}')).toBe('\n.card{display:flex}')
  })
})
