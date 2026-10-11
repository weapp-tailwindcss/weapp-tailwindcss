import type { TailwindV4DesignSystem } from '@/v4'
import { describe, expect, it, vi } from 'vitest'
import {
  canonicalizeBareArbitraryValueCandidates,
  extractTailwindV4InlineSourceCandidates,
  replaceBareArbitraryValueSelectors,
  resolveValidTailwindV4Candidates,
} from '@/v4'

function createDesignSystem(options: {
  parsed?: Set<string>
  css?: Record<string, string | null | undefined>
}): TailwindV4DesignSystem {
  const parsed = options.parsed ?? new Set(Object.keys(options.css ?? {}))
  return {
    parseCandidate: vi.fn((candidate: string) => parsed.has(candidate) ? [{}] : []),
    candidatesToCss: vi.fn((candidates: string[]) => candidates.map(candidate => options.css?.[candidate] ?? `.${candidate}{}`)),
  }
}

describe('Tailwind v4 candidate helpers', () => {
  it('validates candidates, dedupes canonical checks, and maps bare arbitrary originals', () => {
    const designSystem = createDesignSystem({
      parsed: new Set(['p-[10%]', 'text-red-500', 'empty-css']),
      css: {
        'p-[10%]': '.p-\\[10\\%\\]{padding:10%}',
        'text-red-500': '.text-red-500{color:red}',
        'empty-css': '   ',
      },
    })

    expect(resolveValidTailwindV4Candidates(
      designSystem,
      ['', 'p-10%', 'p-10%', 'text-red-500', 'missing', 'empty-css'],
      { bareArbitraryValues: true },
    )).toEqual(new Set(['p-10%', 'text-red-500']))
    expect(designSystem.candidatesToCss).toHaveBeenCalledWith(['p-[10%]', 'text-red-500', 'empty-css'])
  })

  it('returns an empty set when no candidates parse', () => {
    const designSystem = createDesignSystem({ parsed: new Set() })

    expect(resolveValidTailwindV4Candidates(designSystem, ['missing'])).toEqual(new Set())
    expect(designSystem.candidatesToCss).not.toHaveBeenCalled()
  })

  it('canonicalizes bare arbitrary value candidates only when enabled', () => {
    expect(canonicalizeBareArbitraryValueCandidates(['p-10%', 'text-red-500'], true)).toEqual([
      'p-[10%]',
      'text-red-500',
    ])
    expect(canonicalizeBareArbitraryValueCandidates(['p-10%'])).toEqual(['p-10%'])
  })

  it('replaces a single canonical bare arbitrary selector with its original selector', () => {
    expect(replaceBareArbitraryValueSelectors(
      '.p-\\[10\\%\\]{padding:10%}.text-red-500{color:red}',
      ['p-10%', 'text-red-500'],
      true,
    )).toBe('.p-10\\%{padding:10%}.text-red-500{color:red}')
  })

  it('duplicates rules when multiple bare arbitrary originals share one canonical selector', () => {
    expect(replaceBareArbitraryValueSelectors(
      '.bg-\\[\\#fff\\] { background-color: #fff; }\n.text-red-500 { color: red; }',
      ['bg-#fff', 'bg-\\#fff'],
      true,
    )).toBe('.bg-\\#fff, .bg-\\\\\\#fff { background-color: #fff; }\n.text-red-500 { color: red; }')
  })

  it('leaves CSS unchanged when there are no selector aliases', () => {
    expect(replaceBareArbitraryValueSelectors('.text-red-500{}', ['text-red-500'], true)).toBe('.text-red-500{}')
  })

  it('extracts inline source candidates with nested braces, quotes, descending ranges, and exclusions', () => {
    const result = extractTailwindV4InlineSourceCandidates([
      '@source;',
      '@source "./src";',
      '@source inline();',
      '@source inline(foo);',
      '@source inline("{hover:,focus:,}underline bg-{red,{blue,green}}-{100,200} p-{6..2..-2} m-{2..6..-2}");',
      '@source not inline("bg-red-200 escaped\\\\ value");',
    ].join('\n'))

    expect(result.included).toEqual(new Set([
      'hover:underline',
      'focus:underline',
      'underline',
      'bg-red-100',
      'bg-red-200',
      'bg-blue-100',
      'bg-blue-200',
      'bg-green-100',
      'bg-green-200',
      'p-6',
      'p-4',
      'p-2',
      'm-2',
      'm-4',
      'm-6',
    ]))
    expect(result.excluded).toEqual(new Set(['bg-red-200', 'escaped\\ value']))
  })

  it('keeps separators inside quoted and nested inline source values', () => {
    const result = extractTailwindV4InlineSourceCandidates([
      '@source inline("content-[\\"a b\\"] grid-cols-[repeat(2,_minmax(0,_1fr))] {hover:,}focus:underline");',
      '@source inline("{foo\\,bar,baz}");',
    ].join('\n'))

    expect(result.included).toEqual(new Set([
      'content-["a b"]',
      'grid-cols-[repeat(2,_minmax(0,_1fr))]',
      'hover:focus:underline',
      'focus:underline',
      'foo',
      'bar',
      'baz',
    ]))
  })

  it('throws for invalid inline source brace ranges and unbalanced braces', () => {
    expect(() => extractTailwindV4InlineSourceCandidates('@source inline("p-{1..3..0}");'))
      .toThrow('Step cannot be zero')
    expect(() => extractTailwindV4InlineSourceCandidates('@source inline("p-{1..3");'))
      .toThrow('not balanced')
  })
})
