import type { OutputBundle } from 'rollup'
import { describe, expect, it } from 'vitest'
import { createReplayCssAsset } from '@/bundlers/vite/generate-bundle/rollup-assets'
import { removeCssCoveredByRootStyleBundleSources } from '@/bundlers/vite/processed-css-assets'

describe('Vite root CSS content dependency coverage', () => {
  const rootCss = '.label::before{--tw-content:"hello";content:var(--tw-content)}'
  const init = 'view,text,::after,::before{--tw-content:""}'

  it('removes orphan initialization when all content consumers are covered by root CSS', () => {
    const bundle: OutputBundle = { 'entry.wxss': createReplayCssAsset('entry.wxss', rootCss) }
    const css = removeCssCoveredByRootStyleBundleSources(bundle, 'components/card.wxss', `${init}${rootCss}.card{display:flex}`)
    expect(css).toBe('.card{display:flex}')
  })

  it('keeps initialization when a local content consumer remains', () => {
    const bundle: OutputBundle = { 'entry.wxss': createReplayCssAsset('entry.wxss', rootCss) }
    const css = removeCssCoveredByRootStyleBundleSources(bundle, 'components/card.wxss', `${init}${rootCss}.card::before{content:var(--tw-content)}`)
    expect(css).toContain(init)
    expect(css).toContain('.card::before{content:var(--tw-content)}')
  })

  it('preserves user class content assignments after root coverage', () => {
    const bundle: OutputBundle = { 'entry.wxss': createReplayCssAsset('entry.wxss', rootCss) }
    const css = removeCssCoveredByRootStyleBundleSources(bundle, 'components/card.wxss', `${rootCss}.card{--tw-content:""}`)
    expect(css).toBe('.card{--tw-content:""}')
  })
})
