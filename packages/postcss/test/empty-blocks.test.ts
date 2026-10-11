import { finalizeMiniProgramCssStructure, hasEmptyCssBlockCandidate } from '@/index'

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

  it('returns malformed css unchanged when parsing fails', () => {
    const source = '@media (prefers-color-scheme: dark) {}\n.broken {'

    expect(finalizeMiniProgramCssStructure(source)).toBe(source)
  })
})
