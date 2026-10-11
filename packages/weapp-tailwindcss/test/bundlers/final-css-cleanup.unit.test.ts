import { describe, expect, it } from 'vitest'
import { finalizeMiniProgramCssStructure, hasEmptyCssBlockCandidate } from '@/bundlers/shared/final-css-cleanup'

describe('final mini-program css cleanup', () => {
  it('detects empty selector and at-rule blocks with a linear precheck', () => {
    expect(hasEmptyCssBlockCandidate(':is(page,.tw-root,wx-root-portal-content){}')).toBe(true)
    expect(hasEmptyCssBlockCandidate('@media screen { /* token */ .keep { color: red } }')).toBe(false)
    expect(hasEmptyCssBlockCandidate('@media screen { @supports (display: grid) { /* removed */ } }')).toBe(true)
    expect(hasEmptyCssBlockCandidate('@supports (background: url(data:image/svg+xml;utf8,test)) {}')).toBe(true)
    expect(hasEmptyCssBlockCandidate('@keyframes spin { 0% {} to { transform: rotate(1turn); } }')).toBe(false)
    expect(hasEmptyCssBlockCandidate('/* prefix */ @-webkit-keyframes spin { 0% {} }')).toBe(false)
    expect(hasEmptyCssBlockCandidate('@custom "value;{}"; .keep { color: red }')).toBe(false)
  })

  it('ignores large non-empty css without entering the structural scan', () => {
    const source = `${'.keep { color: red; }\n'.repeat(10_000)}.tail { margin: 0; }`

    expect(hasEmptyCssBlockCandidate(source)).toBe(false)
  })

  it('recursively removes empty selector rules and block at-rules', () => {
    const source = [
      '@media (prefers-color-scheme: light) {}',
      '@media screen { @supports (display: grid) { /* removed declarations */ } }',
      '@supports (display: flex) { /* removed declarations */ }',
      ':is(page,.tw-root,wx-root-portal-content) {}',
      '@media print { .removed { /* removed declarations */ } }',
      '.keep { color: red; }',
    ].join('\n')

    expect(finalizeMiniProgramCssStructure(source)).toBe('.keep { color: red; }')
  })

  it('preserves valid dark media and statement at-rules', () => {
    const source = [
      '@charset "UTF-8";',
      '@import "./theme.wxss";',
      '@media (prefers-color-scheme: dark) { .theme { background-color: #232323; } }',
      '@keyframes spin { 0% {} to { transform: rotate(1turn); } }',
    ].join('\n')

    expect(finalizeMiniProgramCssStructure(source)).toBe(source)
  })

  it('removes a trailing unclosed Tailwind source media marker', () => {
    const source = '@media screen {}\n.keep { color: red; }\n@media source(none) {\n'

    expect(finalizeMiniProgramCssStructure(source)).toBe('.keep { color: red; }')
  })

  it('returns css without candidates before parsing', () => {
    const source = `${'/* generated token */'.repeat(25)}\n.keep { color: red; }`
    const startedAt = performance.now()

    expect(finalizeMiniProgramCssStructure(source)).toBe(source)
    expect(performance.now() - startedAt).toBeLessThan(1000)
  })

  it('returns malformed css unchanged when parsing fails', () => {
    const source = '@media (prefers-color-scheme: dark) {}\n.broken {'

    expect(finalizeMiniProgramCssStructure(source)).toBe(source)
  })
})
