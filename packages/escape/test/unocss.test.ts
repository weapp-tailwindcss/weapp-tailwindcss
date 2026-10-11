import { describe, expect, it } from 'vitest'

import { ComplexMappingChars2String, MappingChars2String } from '../src/constants'
import { escape } from '../src/escape'
import { unescape } from '../src/unescape'

const unoClassCases = [
  ['wind arbitrary color', 'bg-[rgb(2,132,199)]'],
  ['wind arbitrary css var', 'text-[var(--brand-color)]'],
  ['arbitrary property', '[mask-type:luminance]'],
  ['arbitrary selector variant', '[&>*]:m-1'],
  ['data attribute variant', 'data-[state=open]:opacity-100'],
  ['aria variant', 'aria-[expanded=true]:rotate-180'],
  ['supports variant', 'supports-[display:grid]:grid'],
  ['container query variant', '@md:hover:bg-sky-500'],
  ['dark media variant', '@dark:text-white'],
  ['media hover variant', '@hover-text-red-500'],
  ['negative arbitrary value', '-top-[3.5px]'],
  ['important utility', '!mt-2'],
  ['postfix opacity', 'bg-red-500/50'],
  ['css calc arbitrary value', 'w-[calc(100%-theme(spacing.4))]'],
  ['quoted arbitrary content', 'before:content-["hello:uno"]'],
  ['single quoted arbitrary content', 'after:content-[\'*\']'],
  ['icon dash syntax', 'i-carbon-sun'],
  ['icon colon syntax', 'i-ph:anchor-simple-thin'],
  ['icon query mode', 'i-vscode-icons:file-type-light-pnpm?mask'],
  ['emoji icon name', 'i-twemoji:grinning-face-with-smiling-eyes'],
  ['custom shortcut-like token', 'btn-primary'],
] as const

const unoAmbiguousDefaultTokenCases = [
  ['arbitrary value with underscore spacing', 'grid-cols-[200px_minmax(900px,_1fr)_100px]'],
] as const

const unoGroupAndAttributifyCases = [
  ['variant group', 'hover:(bg-blue-600 text-white scale-105)'],
  ['nested variant group', 'lg:hover:(bg-blue-500 text-white)'],
  ['prefix group', 'font-(light mono)'],
  ['attributify bg value', 'blue-400 hover:blue-500'],
  ['attributify border value', '~ rounded blue-200'],
  ['attributify prefixed attr', 'un-text="red"'],
] as const

describe('unocss compatibility', () => {
  it.each(unoClassCases)('round-trips %s class syntax', (_, source) => {
    const escaped = escape(source)

    expect(escaped).not.toContain('[')
    expect(escaped).not.toContain(']')
    expect(escaped).not.toContain(':')
    expect(unescape(escaped, { map: MappingChars2String })).toBe(source)
  })

  it.each(unoGroupAndAttributifyCases)('round-trips %s syntax fragments', (_, source) => {
    const escaped = escape(source)

    expect(unescape(escaped, { map: MappingChars2String })).toBe(source)
  })

  it.each(unoAmbiguousDefaultTokenCases)('escapes %s without requiring lossy default-map unescape', (_, source) => {
    const escaped = escape(source)

    expect(escaped).toBe('grid-cols-_b200px_minmax_p900px_m_1fr_P_100px_B')
  })

  it('round-trips a mixed unocss class list', () => {
    const source = [
      'uno-layer-components',
      'dark:data-[state=open]:bg-[rgba(15,23,42,0.92)]',
      '@md:hover:i-carbon-moon',
      'lt-sm:grid-cols-[repeat(2,minmax(0,1fr))]',
      'before:content-["unocss"]',
    ].join(' ')

    const escaped = escape(source)

    expect(escaped).toBe(
      'uno-layer-components dark_cdata-_bstate_zopen_B_cbg-_brgba_p15_m23_m42_m0_d92_P_B _tmd_chover_ci-carbon-moon lt-sm_cgrid-cols-_brepeat_p2_mminmax_p0_m1fr_P_P_B before_ccontent-_b_qunocss_q_B',
    )
    expect(unescape(escaped, { map: MappingChars2String })).toBe(source)
  })

  it('supports unocss syntax with complex mapping', () => {
    const source = 'dark:[&_.icon]:i-ph:anchor-simple-thin?mask'
    const escaped = escape(source, { map: ComplexMappingChars2String })

    expect(escaped).toBe('dark_cc_cb_cn__cdicon_cB_cci-ph_ccanchor-simple-thin_cQmask')
    expect(unescape(escaped, { map: ComplexMappingChars2String })).toBe(source)
  })
})
