import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it, vi } from 'vitest'
import * as classNameTransform from '@/shared/classname-transform'
import * as wxmlShared from '@/wxml/shared'

describe('classname transform caching', () => {
  it('reuses escaped candidate results for repeated lookups', () => {
    const spy = vi.spyOn(wxmlShared, 'replaceWxml')
    const classNameSet = new Set(['bg-_b_h123456_B'])

    const first = classNameTransform.resolveClassNameTransformWithResult('bg-[#123456]', {
      classNameSet,
      escapeMap: MappingChars2String,
    })
    const second = classNameTransform.resolveClassNameTransformWithResult('bg-[#123456]', {
      classNameSet,
      escapeMap: MappingChars2String,
    })

    expect(first).toEqual({
      decision: 'escaped',
      escapedValue: 'bg-_b_h123456_B',
    })
    expect(second).toEqual(first)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('keeps escaped candidate caching stable for multiple candidates sharing one escape map', () => {
    const spy = vi.spyOn(wxmlShared, 'replaceWxml')
    spy.mockClear()
    const classNameSet = new Set(['w-_b100px_B', 'h-_b37px_B'])

    const firstWidth = classNameTransform.resolveClassNameTransformWithResult('w-[100px]', {
      classNameSet,
      escapeMap: MappingChars2String,
    })
    const firstHeight = classNameTransform.resolveClassNameTransformWithResult('h-[37px]', {
      classNameSet,
      escapeMap: MappingChars2String,
    })
    const secondWidth = classNameTransform.resolveClassNameTransformWithResult('w-[100px]', {
      classNameSet,
      escapeMap: MappingChars2String,
    })
    const secondHeight = classNameTransform.resolveClassNameTransformWithResult('h-[37px]', {
      classNameSet,
      escapeMap: MappingChars2String,
    })

    expect(firstWidth).toEqual({
      decision: 'escaped',
      escapedValue: 'w-_b100px_B',
    })
    expect(firstHeight).toEqual({
      decision: 'escaped',
      escapedValue: 'h-_b37px_B',
    })
    expect(secondWidth).toEqual(firstWidth)
    expect(secondHeight).toEqual(firstHeight)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('honors explicit preserve rules before alwaysEscape', () => {
    const result = classNameTransform.resolveClassNameTransformWithResult('third-party-[token]', {
      alwaysEscape: true,
      jsPreserveClass: candidate => candidate.startsWith('third-party-'),
    })

    expect(result).toEqual({
      decision: 'skip',
    })
  })

  it('does not let the legacy fallback option bypass classNameSet', () => {
    const result = classNameTransform.resolveClassNameTransformWithResult('  bg-[length:200rpx_100rpx]  ', {
      classContext: true,
      jsArbitraryValueFallback: true,
    })

    expect(result).toEqual({
      decision: 'skip',
    })
  })

  it('does not match arbitrary hex candidates case-insensitively against runtime class sets', () => {
    const result = classNameTransform.resolveClassNameTransformWithResult('bg-[#4268EA]', {
      classNameSet: new Set(['bg-[#4268ea]']),
      escapeMap: MappingChars2String,
    })

    expect(result).toEqual({
      decision: 'skip',
    })
  })

  it('does not match shorthand arbitrary hex candidates against different runtime tokens', () => {
    const result = classNameTransform.resolveClassNameTransformWithResult('bg-[#f00]', {
      classNameSet: new Set(['bg-[#ff0000]']),
      escapeMap: MappingChars2String,
    })

    expect(result).toEqual({
      decision: 'skip',
    })
  })

  it.each([
    ['bg-[rgb(12,34,56)]', 'bg-[rgb(12,34,57)]'],
    ['bg-[var(--primary-color-hex)]', 'bg-[var(--primary-color-bg)]'],
    ['w-[calc(100%_-_12px)]', 'w-[calc(100%_-_24px)]'],
    ['text-[14px]', 'text-[22px]'],
    ['px-[432.43px]', 'px-[256.25px]'],
  ])('does not match similar arbitrary candidates without exact runtime hits: %s vs %s', (rawToken, runtimeToken) => {
    const result = classNameTransform.resolveClassNameTransformWithResult(rawToken, {
      classNameSet: new Set([runtimeToken]),
      escapeMap: MappingChars2String,
    })

    expect(result).toEqual({
      decision: 'skip',
    })
  })

  it('keeps whitespace-wrapped url-like arbitrary fragments unchanged', () => {
    const result = classNameTransform.resolveClassNameTransformWithResult('  https://foo-bar.com/assets/[token]  ', {
      classContext: true,
      jsArbitraryValueFallback: true,
    })

    expect(result).toEqual({
      decision: 'skip',
    })
  })

  it.each([true, 'auto'] as const)('keeps arbitrary candidates unchanged for legacy fallback value %s', (jsArbitraryValueFallback) => {
    const result = classNameTransform.resolveClassNameTransformWithResult('bg-[length:200rpx_100rpx]', {
      classContext: true,
      classNameSet: new Set<string>(),
      jsArbitraryValueFallback,
      tailwindcssMajorVersion: 4,
    })

    expect(result).toEqual({ decision: 'skip' })
  })
})
