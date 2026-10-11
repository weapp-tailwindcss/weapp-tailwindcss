import { describe, expect, it } from 'vitest'
import {
  extractMarkedUserLayerComponentsCss,
  mergeMarkedUserLayerComponentsCss,
  reorderMarkedUserLayerComponentsCss,
  wrapUserLayerComponentsCss,
} from '@/generation/user-layer-order'

describe('user layer order helpers', () => {
  it('wraps, extracts, and reorders marked component layers before utilities', () => {
    const marked = wrapUserLayerComponentsCss('.card{display:flex}')
    const css = `.before{color:red}\n${marked}\n.flex{display:flex}`
    const extracted = extractMarkedUserLayerComponentsCss(css)

    expect(wrapUserLayerComponentsCss('')).toBe('')
    expect(extracted.layers).toEqual(['.card{display:flex}'])
    expect(extracted.rest).toContain('.before')
    expect(reorderMarkedUserLayerComponentsCss('.plain{color:red}')).toBe('.plain{color:red}')
    const reordered = reorderMarkedUserLayerComponentsCss(css)
    expect(reordered.indexOf('.card{display:flex}')).toBeLessThan(reordered.indexOf('.before{color:red}'))
    expect(reordered.indexOf('.before{color:red}')).toBeLessThan(reordered.indexOf('.flex{display:flex}'))
  })

  it('merges marked layers while removing existing matching rules from base css', () => {
    const marked = wrapUserLayerComponentsCss('.card{display:grid}')
    const merged = mergeMarkedUserLayerComponentsCss('.card{display:flex}.card:hover{color:red}.flex{display:flex}', marked)

    expect(mergeMarkedUserLayerComponentsCss('.base{}', '.plain{}')).toEqual({
      css: '.base{}',
      merged: false,
    })
    expect(mergeMarkedUserLayerComponentsCss('.base{}', '/*! weapp-tailwindcss layer components start */')).toEqual({
      css: '.base{}',
      merged: false,
    })
    expect(merged.merged).toBe(true)
    expect(merged.css).toContain('.card{display:grid}')
    expect(merged.css).not.toContain('.card{display:flex}')
    expect(merged.css).not.toContain('.card:hover')
  })

  it('uses css structure instead of indentation to place user layers before generated rules', () => {
    const marked = wrapUserLayerComponentsCss([
      'button::after,wx-button::after{display:none;border:none;content:""}',
      'wx-button{background:#000}',
      '.layer-card-v4{display:flex;color:var(--color-midnight)}',
    ].join(''))
    const css = [
      ':host,page,.tw-root{--color-midnight:#121063}',
      '  view,text,::after,::before{box-sizing:border-box;border:0 solid}',
      '  .layer-card-v4{display:flex;color:var(--color-midnight)}',
      '  .template-corpus-apply{display:inline-flex}',
      marked,
      '  .m-3{margin:12px}',
      'wx-button{background:#444}',
    ].join('\n')

    const reordered = reorderMarkedUserLayerComponentsCss(css)

    expect(reordered.indexOf('view,text')).toBeLessThan(reordered.indexOf('button::after'))
    expect(reordered.indexOf('button::after')).toBeLessThan(reordered.indexOf('.layer-card-v4'))
    expect(reordered.indexOf('.layer-card-v4')).toBeLessThan(reordered.indexOf('.template-corpus-apply'))
    expect(reordered.indexOf('.template-corpus-apply')).toBeLessThan(reordered.indexOf('.m-3'))
    expect(reordered.indexOf('.m-3')).toBeLessThan(reordered.indexOf('wx-button{background:#444}'))
    expect(reordered.match(/\.layer-card-v4/g)).toHaveLength(1)
  })

  it('handles empty marked layers and missing base chunks without changing css', () => {
    const emptyMarked = [
      '/*! weapp-tailwindcss layer components start */',
      '/*! weapp-tailwindcss layer components end */',
    ].join('\n')
    const unmatchedMarked = wrapUserLayerComponentsCss('.missing{display:block}')
    const merged = mergeMarkedUserLayerComponentsCss('.base{color:red}', unmatchedMarked)

    expect(reorderMarkedUserLayerComponentsCss(emptyMarked)).toBe('')
    expect(merged.merged).toBe(true)
    expect(merged.css).toContain('.base{color:red}')
    expect(merged.css).toContain('.missing{display:block}')
  })

  it('falls back to string removal when css parsing fails', () => {
    const marked = wrapUserLayerComponentsCss('.broken{')
    const merged = mergeMarkedUserLayerComponentsCss('.broken{\n.keep{color:red}', marked)

    expect(merged.merged).toBe(true)
    expect(merged.css).toContain('.broken{')
  })

  it('keeps broken base css when fallback removal cannot find the layer chunk', () => {
    const marked = wrapUserLayerComponentsCss('.missing{')
    const merged = mergeMarkedUserLayerComponentsCss('.broken{\n.keep{color:red}', marked)

    expect(merged.merged).toBe(true)
    expect(merged.css).toContain('.broken{')
    expect(merged.css).toContain('.missing{')
  })

  it('uses string fallback removal when invalid css contains the exact marked chunk', () => {
    const marked = wrapUserLayerComponentsCss('.broken{')
    const merged = mergeMarkedUserLayerComponentsCss('.before{color:red}\n.broken{\n.keep{color:red}', marked)

    expect(merged.merged).toBe(true)
    expect(merged.css).toContain('.before{color:red}')
    expect(merged.css).toContain('.keep{color:red}')
  })

  it('keeps existing css when a marked layer is empty after trimming', () => {
    const marked = wrapUserLayerComponentsCss('   ')

    expect(marked).toBe('   ')
    expect(mergeMarkedUserLayerComponentsCss('.base{}', marked)).toEqual({
      css: '.base{}',
      merged: false,
    })
  })
})
