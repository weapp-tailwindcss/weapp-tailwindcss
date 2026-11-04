import { describe, expect, it } from 'vitest'
import { hasScopedDarkApplyProbeDisplay, hasScopedDarkApplyProbeStyle, initialScopedDarkApplyProbeState, replaceScopedDarkApplyProbeState } from './scopedDarkApplyProbe'

const base = '.hello-scss[data-v-a]{display:flex;background-color:#f1f1f1}'
const dark = '.hello-scss[data-v-a]{background-color:#232323}'
const state = initialScopedDarkApplyProbeState

describe('scoped dark apply output probe', () => {
  it.each(['(prefers-color-scheme: dark)', '(prefers-color-scheme:dark)', '( PREFERS-COLOR-SCHEME : DARK )'])('accepts a positive dark feature %s', (condition) => {
    expect(hasScopedDarkApplyProbeStyle(`${base}@media ${condition}{${dark}}`, state)).toBe(true)
  })

  it('accepts platform scope classes and declarations split across rules', () => {
    const css = '.hello-scss.data-v-a{display:flex}.hello-scss.data-v-a{background-color:#f1f1f1}@layer components{@media(prefers-color-scheme:dark){.hello-scss.data-v-a{background-color:#232323}}}'
    expect(hasScopedDarkApplyProbeStyle(css, state)).toBe(true)
  })

  it.each([
    'not all and (prefers-color-scheme: dark)',
    '(prefers-color-scheme: light)',
    '(prefers-color-scheme: dark), (prefers-color-scheme: light)',
    '(min-width:1px) and (prefers-color-scheme: dark)',
  ])('rejects unrelated or conditional media %s', (condition) => {
    expect(hasScopedDarkApplyProbeStyle(`${base}@media ${condition}{${dark}}`, state)).toBe(false)
  })

  it.each(['.hello-scss-wrong[data-v-a]', '.hello-scss[data-v-a]::before', '.hello-scss[data-v-a] .child', '.hello-scss[data-v-b]'])('rejects a different subject or scope %s', (selector) => {
    expect(hasScopedDarkApplyProbeStyle(`${base}@media(prefers-color-scheme: dark){${selector}{background-color:#232323}}`, state)).toBe(false)
  })

  it('does not attribute nested child declarations to the probe', () => {
    const css = '.hello-scss[data-v-a]{.child{display:flex;background-color:#f1f1f1}}'
    expect(hasScopedDarkApplyProbeStyle(`${css}@media(prefers-color-scheme: dark){${dark}}`, state)).toBe(false)
    expect(hasScopedDarkApplyProbeDisplay(css, 'flex')).toBe(false)
  })

  it('rejects an additional conditional ancestor', () => {
    expect(hasScopedDarkApplyProbeStyle(`${base}@media(min-width:1px){@media(prefers-color-scheme: dark){${dark}}}`, state)).toBe(false)
    expect(hasScopedDarkApplyProbeStyle(`${base}@supports(display:grid){@media(prefers-color-scheme: dark){${dark}}}`, state)).toBe(false)
  })

  it('requires base declarations outside conditional media', () => {
    expect(hasScopedDarkApplyProbeStyle(`@media(min-width:1px){${base}}@media(prefers-color-scheme: dark){${dark}}`, state)).toBe(false)
  })

  it('requires the Vue scope on both base and dark subjects', () => {
    expect(hasScopedDarkApplyProbeStyle('.hello-scss{display:flex;background-color:#f1f1f1}@media(prefers-color-scheme:dark){.hello-scss{background-color:#232323}}', state)).toBe(false)
    expect(hasScopedDarkApplyProbeDisplay('.hello-scss{display:flex}', 'flex')).toBe(false)
  })

  it('rejects missing, malformed and stale dark output', () => {
    expect(hasScopedDarkApplyProbeStyle(base, state)).toBe(false)
    expect(hasScopedDarkApplyProbeStyle(`${base}@media(`, state)).toBe(false)
    const updated = { display: 'block', darkBackground: '#242424' } as const
    const css = `${base.replace('flex', 'block')}@media(prefers-color-scheme: dark){${dark.replace('#232323', '#242424')}}`
    expect(hasScopedDarkApplyProbeStyle(css, { ...updated, staleDarkBackgrounds: ['#232323'] })).toBe(true)
    expect(hasScopedDarkApplyProbeStyle(`${css}@media(prefers-color-scheme: dark){${dark}}`, { ...updated, staleDarkBackgrounds: ['#232323'] })).toBe(false)
    expect(hasScopedDarkApplyProbeStyle(`${css}@media(min-width:1px){@media(prefers-color-scheme: dark){${dark}}}`, { ...updated, staleDarkBackgrounds: ['#232323'] })).toBe(false)
    expect(hasScopedDarkApplyProbeStyle(`${css}@media(prefers-color-scheme: dark), (min-width:1px){${dark}}`, { ...updated, staleDarkBackgrounds: ['#232323'] })).toBe(false)
  })

  it.each([
    `${base.replace('display:flex', 'display:flex;display:none')}@media(prefers-color-scheme:dark){${dark}}`,
    `${base}.hello-scss[data-v-a]{display:none}@media(prefers-color-scheme:dark){${dark}}`,
    `${base}.hello-scss[data-v-a]{background-color:red}@media(prefers-color-scheme:dark){${dark}}`,
    `${base}@media(prefers-color-scheme:dark){${dark}.hello-scss[data-v-a]{background-color:red}}`,
  ])('rejects conflicting declarations for the same scope', (css) => {
    expect(hasScopedDarkApplyProbeStyle(css, state)).toBe(false)
  })

  it('rewrites only the intended apply state', () => {
    const updated = { display: 'block', darkBackground: '#242424' } as const
    expect(replaceScopedDarkApplyProbeState('.hello{@apply flex bg-[#f1f1f1] dark:bg-[#232323];color:red}', state, updated)).toBe('.hello{@apply block bg-[#f1f1f1] dark:bg-[#242424];color:red}')
  })
})
