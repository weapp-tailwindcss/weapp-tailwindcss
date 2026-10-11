import { describe, expect, it } from 'vitest'
import {
  escapeCssClassName,
  extractBareArbitraryValueSourceCandidates,
  extractBareArbitraryValueSourceCandidatesWithPositions,
  isBareArbitraryValuesEnabled,
  resolveBareArbitraryValueCandidate,
} from '@/v4/bare-arbitrary-values'

describe('bare arbitrary value resolver', () => {
  it('resolves common UnoCSS-style bare arbitrary values', () => {
    expect(resolveBareArbitraryValueCandidate('p-10%', true)).toEqual({
      candidate: 'p-10%',
      canonicalCandidate: 'p-[10%]',
    })
    expect(resolveBareArbitraryValueCandidate('p-2.5px', true)).toEqual({
      candidate: 'p-2.5px',
      canonicalCandidate: 'p-[2.5px]',
    })
    expect(resolveBareArbitraryValueCandidate('m-4rem', true)).toEqual({
      candidate: 'm-4rem',
      canonicalCandidate: 'm-[4rem]',
    })
  })

  it('supports variants, negative values and important modifiers', () => {
    expect(resolveBareArbitraryValueCandidate('hover:!-mt-2rem', true)).toEqual({
      candidate: 'hover:!-mt-2rem',
      canonicalCandidate: 'hover:!-mt-[2rem]',
    })
    expect(resolveBareArbitraryValueCandidate('sm:-top-1.5rem', true)).toEqual({
      candidate: 'sm:-top-1.5rem',
      canonicalCandidate: 'sm:-top-[1.5rem]',
    })
  })

  it('supports hex colors and function values', () => {
    expect(resolveBareArbitraryValueCandidate('bg-#fff', true)).toEqual({
      candidate: 'bg-#fff',
      canonicalCandidate: 'bg-[#fff]',
    })
    expect(resolveBareArbitraryValueCandidate('bg-\\#fff', true)).toEqual({
      candidate: 'bg-\\#fff',
      canonicalCandidate: 'bg-[#fff]',
    })
    expect(resolveBareArbitraryValueCandidate('text-rgb(255,0,0)', true)).toEqual({
      candidate: 'text-rgb(255,0,0)',
      canonicalCandidate: 'text-[rgb(255,0,0)]',
    })
    expect(resolveBareArbitraryValueCandidate('w-[calc(100%-1rem)]', true)).toBeUndefined()
    expect(resolveBareArbitraryValueCandidate('w-calc(100vh)', true)).toEqual({
      candidate: 'w-calc(100vh)',
      canonicalCandidate: 'w-[calc(100vh)]',
    })
    expect(resolveBareArbitraryValueCandidate('w-calc(100%_-_1rem)', true)).toEqual({
      candidate: 'w-calc(100%_-_1rem)',
      canonicalCandidate: 'w-[calc(100%_-_1rem)]',
    })
  })

  it('keeps escaped underscores inside arbitrary values', () => {
    expect(resolveBareArbitraryValueCandidate('content-"hello_world"', true)).toEqual({
      candidate: 'content-"hello_world"',
      canonicalCandidate: 'content-["hello_world"]',
    })
    expect(resolveBareArbitraryValueCandidate('content-"hello\\_world"', true)).toEqual({
      candidate: 'content-"hello\\_world"',
      canonicalCandidate: 'content-["hello\\_world"]',
    })
    expect(resolveBareArbitraryValueCandidate('content-"hello\\5f world"', true)).toEqual({
      candidate: 'content-"hello\\5f world"',
      canonicalCandidate: 'content-["hello\\_world"]',
    })
  })

  it('prefers the longest utility prefix before bare function values', () => {
    expect(resolveBareArbitraryValueCandidate('grid-cols-repeat(2,_minmax(0,_1fr))', true)).toEqual({
      candidate: 'grid-cols-repeat(2,_minmax(0,_1fr))',
      canonicalCandidate: 'grid-cols-[repeat(2,_minmax(0,_1fr))]',
    })
  })

  it('rejects ambiguous or unsupported values', () => {
    expect(resolveBareArbitraryValueCandidate('p-4', true)).toBeUndefined()
    expect(resolveBareArbitraryValueCandidate('bg-red-500', true)).toBeUndefined()
    expect(resolveBareArbitraryValueCandidate('text-var(--brand)', true)).toEqual({
      candidate: 'text-var(--brand)',
      canonicalCandidate: 'text-[color:var(--brand)]',
    })
    expect(resolveBareArbitraryValueCandidate('w-calc(100%-1rem', true)).toBeUndefined()
  })

  it('supports UnoCSS aspect ratio shorthand', () => {
    expect(resolveBareArbitraryValueCandidate('aspect-16/9', true)).toEqual({
      candidate: 'aspect-16/9',
      canonicalCandidate: 'aspect-[16/9]',
    })
  })

  it('respects custom unit allow lists', () => {
    expect(resolveBareArbitraryValueCandidate('p-10%', { units: ['px'] })).toBeUndefined()
    expect(resolveBareArbitraryValueCandidate('p-10px', { units: ['px'] })).toEqual({
      candidate: 'p-10px',
      canonicalCandidate: 'p-[10px]',
    })
  })

  it('reports whether bare arbitrary values are enabled after option normalization', () => {
    expect(isBareArbitraryValuesEnabled(undefined)).toBe(false)
    expect(isBareArbitraryValuesEnabled(false)).toBe(false)
    expect(isBareArbitraryValuesEnabled({ units: [] })).toBe(false)
    expect(isBareArbitraryValuesEnabled({ units: ['', 'px', 'px'] })).toBe(true)
    expect(resolveBareArbitraryValueCandidate('p-1rem', { units: ['', 'rem'] })).toEqual({
      candidate: 'p-1rem',
      canonicalCandidate: 'p-[1rem]',
    })
  })

  it('rejects unbalanced, already canonical, empty, and malformed bare arbitrary candidates', () => {
    expect(resolveBareArbitraryValueCandidate('', true)).toBeUndefined()
    expect(resolveBareArbitraryValueCandidate('w-[10px]', true)).toBeUndefined()
    expect(resolveBareArbitraryValueCandidate('w-calc(100%))', true)).toBeUndefined()
    expect(resolveBareArbitraryValueCandidate('content-"unterminated', true)).toBeUndefined()
    expect(resolveBareArbitraryValueCandidate('-4px', true)).toBeUndefined()
    expect(resolveBareArbitraryValueCandidate('p-', true)).toBeUndefined()
    expect(resolveBareArbitraryValueCandidate('p-\\', true)).toBeUndefined()
  })

  it('handles escaped function and quoted values while resolving candidates', () => {
    expect(resolveBareArbitraryValueCandidate('content-"hello\\nworld"', true)).toEqual({
      candidate: 'content-"hello\\nworld"',
      canonicalCandidate: 'content-["hellonworld"]',
    })
    expect(resolveBareArbitraryValueCandidate('w-calc("100%"_+_1rem)', true)).toEqual({
      candidate: 'w-calc("100%"_+_1rem)',
      canonicalCandidate: 'w-[calc("100%"_+_1rem)]',
    })
    expect(resolveBareArbitraryValueCandidate('w-calc(100%\\)_+_1rem)', true)).toBeUndefined()
    expect(resolveBareArbitraryValueCandidate('w-calc("100\\")"_+_1rem)', true)).toBeUndefined()
  })

  it('extracts bare arbitrary source candidates with positions and deduped values', () => {
    const source = [
      '<view class="p-10% m-4rem text-var(--brand)">',
      'w-calc(100%_-_1rem)\\nignored=value [w-1px]',
      '`bg-#fff` bg-#fff',
    ].join(' ')
    const normalizedSource = source.replace(/\\[nrt]/g, ' ')

    expect(extractBareArbitraryValueSourceCandidatesWithPositions(source, true)).toEqual([
      { rawCandidate: 'p-10%', start: source.indexOf('p-10%'), end: source.indexOf('p-10%') + 'p-10%'.length },
      { rawCandidate: 'm-4rem', start: source.indexOf('m-4rem'), end: source.indexOf('m-4rem') + 'm-4rem'.length },
      { rawCandidate: 'text-var(--brand)', start: source.indexOf('text-var(--brand)'), end: source.indexOf('text-var(--brand)') + 'text-var(--brand)'.length },
      { rawCandidate: 'w-calc(100%_-_1rem)', start: source.indexOf('w-calc(100%_-_1rem)'), end: source.indexOf('w-calc(100%_-_1rem)') + 'w-calc(100%_-_1rem)'.length },
      { rawCandidate: 'w-1px', start: normalizedSource.indexOf('w-1px'), end: normalizedSource.indexOf('w-1px') + 'w-1px'.length },
      { rawCandidate: 'bg-#fff', start: normalizedSource.indexOf('bg-#fff'), end: normalizedSource.indexOf('bg-#fff') + 'bg-#fff'.length },
      { rawCandidate: 'bg-#fff', start: normalizedSource.lastIndexOf('bg-#fff'), end: normalizedSource.lastIndexOf('bg-#fff') + 'bg-#fff'.length },
    ])
    expect(extractBareArbitraryValueSourceCandidates(source, true)).toEqual([
      'p-10%',
      'm-4rem',
      'text-var(--brand)',
      'w-calc(100%_-_1rem)',
      'w-1px',
      'bg-#fff',
    ])
    expect(extractBareArbitraryValueSourceCandidates(source)).toEqual([])
  })

  it('tracks quoted bare arbitrary source tokens and escaped characters', () => {
    const source = 'content-"hello world" w-calc(100%\\_+\\_1rem) `text-rgb(255,0,0)`'

    expect(extractBareArbitraryValueSourceCandidatesWithPositions(source, true)).toEqual([
      {
        rawCandidate: 'w-calc(100%\\_+\\_1rem)',
        start: source.indexOf('w-calc(100%\\_+\\_1rem)'),
        end: source.indexOf('w-calc(100%\\_+\\_1rem)') + 'w-calc(100%\\_+\\_1rem)'.length,
      },
      {
        rawCandidate: 'text-rgb(255,0,0)',
        start: source.indexOf('text-rgb(255,0,0)'),
        end: source.indexOf('text-rgb(255,0,0)') + 'text-rgb(255,0,0)'.length,
      },
    ])
  })

  it('escapes class selectors according to CSS escaping rules', () => {
    expect(escapeCssClassName('\0')).toBe('\uFFFD')
    expect(escapeCssClassName('1/2')).toBe('\\31 \\/2')
    expect(escapeCssClassName('-1px')).toBe('-\\31 px')
    expect(escapeCssClassName('hover:bg-[#fff]')).toBe('hover\\:bg-\\[\\#fff\\]')
    expect(escapeCssClassName('中文')).toBe('中文')
  })
})
