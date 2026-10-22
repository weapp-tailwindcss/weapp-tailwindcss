import { afterEach, describe, expect, it, vi } from 'vitest'
import { removeUnsupportedMiniProgramAtRules } from '../src/compat/mini-program-css/at-rules'
import { normalizeMiniProgramColorMix } from '../src/compat/mini-program-css/modern-colors'
import { prepareProcessedMiniProgramUserCss, removeMiniProgramInteractiveSelectors, removeProcessedMiniProgramUnsupportedCss, unwrapMiniProgramCascadeLayers } from '../src/compat/tailwindcss-v4/user-css/source-fragments'
import { postcss } from '../src/postcss-runtime'

describe('processed mini CSS preparation lifecycle', () => {
  afterEach(() => vi.restoreAllMocks())

  const source = [
    '@layer theme {:root {--color-brand:rgb(10 20 30);--weight:25%}}',
    '@property --registered {syntax:"<color>";inherits:true;initial-value:red}',
    ':root {--registered:blue;--local:red;--conditional:red}',
    '.theme {--local:blue}',
    '@media (prefers-color-scheme:dark) {:root {--conditional:blue}}',
    '.static {color:color-mix(in srgb,var(--color-brand) var(--weight),transparent)}',
    ...['registered', 'local', 'conditional'].map(name => `.dynamic-${name} {color:color-mix(in srgb,var(--${name}) 50%,transparent);width:1px}`),
    '.interactive:hover,.interactive:active,.interactive {color:red}',
    '@supports (display:grid) {.unsupported {display:grid}}',
    ...Array.from({ length: 1000 }, (_, index) => `.utility-${index} {padding:1px}`),
  ].join('\n')

  it.each([
    '.probe{color:color-mix(in srgb,red 50%,transparent)}',
    '@media source(none){.probe{color:color-mix(in srgb,red 50%,transparent)}}',
  ])('keeps the public platform cleanup boundary for %s', (input) => {
    expect(removeProcessedMiniProgramUnsupportedCss(input, {})).toBe(input)
    expect(prepareProcessedMiniProgramUserCss(input, {})).toBe('.probe{color:rgba(255, 0, 0, 0.5)}')
  })

  it('normalizes before discarding registration and conditional evidence', () => {
    const result = prepareProcessedMiniProgramUserCss(source, {})
    expect(result).toContain('.static {color:rgba(10, 20, 30, 0.25)}')
    expect(result).toContain('.dynamic-registered {width:1px}')
    expect(result).toContain('.dynamic-local {width:1px}')
    expect(result).toContain('.dynamic-conditional {width:1px}')
    expect(result).not.toContain('color-mix(')
    expect(result).not.toContain('@property')
    expect(result).not.toContain('@supports')
  })

  it('uses one AST for color, unsupported at-rule and interactive cleanup', () => {
    const expected = removeMiniProgramInteractiveSelectors(
      removeUnsupportedMiniProgramAtRules(source),
      { active: true, hover: true, focus: true },
    )
    const layerExpected = unwrapMiniProgramCascadeLayers(removeMiniProgramInteractiveSelectors(
      removeUnsupportedMiniProgramAtRules(normalizeMiniProgramColorMix(source)),
      { active: true, hover: true, focus: true },
    ))
    const parse = vi.spyOn(postcss, 'parse')
    const result = removeProcessedMiniProgramUnsupportedCss(source, {})
    expect(result).toBe(expected)
    expect(parse).toHaveBeenCalledTimes(1)
    expect(unwrapMiniProgramCascadeLayers(result)).toContain('.utility-999 {padding:1px}')
    parse.mockClear()
    expect(prepareProcessedMiniProgramUserCss(source, {})).toBe(layerExpected)
    expect(parse).toHaveBeenCalledTimes(1)
  })

  it.each([
    '.empty{} @supports(display:grid){.removed:hover{color:red}}',
    '.empty{} .normal{color:red}',
    '.empty{}\r\n@layer theme{.normal{color:red}}',
    '@layer outer{@layer inner{.nested{color:red}}}.plain{width:1px}',
    '.hover:hover,.active:active,.focus:focus,.normal{color:red}',
    '.quoted{content:"color-mix(";background:url("color-mix(")}',
    '.escaped{color:color\\2d mix(in srgb,red 50%,transparent)}',
    '.upper{color:COLOR-MIX(in srgb,red 50%,transparent)}',
    '@media source(none){:root{--brand:red}.a{color:color-mix(in srgb,var(--brand) 50%,transparent)}}',
    '@media print{:root{--brand:red}}.a{color:color-mix(in srgb,var(--brand) 50%,transparent)}',
    '/* ! tokens: gone <= fixture.tsx */.gone{color:color-mix(in srgb,var(--dynamic) 50%,transparent)}.keep{width:1px}',
    '@supports(display:grid){.removed{color:red}}.editing{',
  ])('retains old stage output for %s', (input) => {
    for (const mask of Array.from({ length: 8 }, (_, index) => index)) {
      const selectors = { active: Boolean(mask & 1), hover: Boolean(mask & 2), focus: Boolean(mask & 4) }
      const expected = removeMiniProgramInteractiveSelectors(
        removeUnsupportedMiniProgramAtRules(input),
        selectors,
      )
      const preparedExpected = removeMiniProgramInteractiveSelectors(
        removeUnsupportedMiniProgramAtRules(normalizeMiniProgramColorMix(input)),
        selectors,
      )
      expect(removeProcessedMiniProgramUnsupportedCss(input, {
        cssRemoveActivePseudoClass: selectors.active,
        cssRemoveHoverPseudoClass: selectors.hover,
        cssRemoveFocusPseudoClass: selectors.focus,
      })).toBe(expected)
      expect(prepareProcessedMiniProgramUserCss(input, {
        cssRemoveActivePseudoClass: selectors.active,
        cssRemoveHoverPseudoClass: selectors.hover,
        cssRemoveFocusPseudoClass: selectors.focus,
      })).toBe(unwrapMiniProgramCascadeLayers(preparedExpected))
    }
  })
})
