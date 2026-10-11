import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { identity, resolveTransformers } from '@/transformers'

describe('resolveTransformers', () => {
  it('provides default escape and unescape behaviour', () => {
    const transformers = resolveTransformers()

    expect(transformers.escape('text-[#ececec]')).toBe('text-_b_hececec_B')
    expect(transformers.unescape('text-_b_hececec_B')).toBe('text-[#ececec]')
  })

  it('shares custom mapping between escape and unescape', () => {
    const transformers = resolveTransformers({
      escape: {
        map: {
          '#': '__hash__',
        },
      },
    })

    const escaped = transformers.escape('text-[#ececec]')
    expect(escaped).toContain('__hash__')
    expect(transformers.unescape(escaped)).toBe('text-[#ececec]')
  })

  it('disables escape while keeping unescape active', () => {
    const transformers = resolveTransformers({ escape: false })

    expect(transformers.escape('text-[#ececec]')).toBe('text-[#ececec]')
    expect(transformers.unescape('text-_b_hececec_B')).toBe('text-[#ececec]')
  })

  it('disables unescape while keeping escape active', () => {
    const transformers = resolveTransformers({ unescape: false })

    const escaped = transformers.escape('text-[#ececec]')
    expect(escaped).toBe('text-_b_hececec_B')
    expect(transformers.unescape(escaped)).toBe(escaped)
  })

  it('falls back to default map when only unescape map is provided', () => {
    const transformers = resolveTransformers({
      unescape: {
        map: MappingChars2String,
      },
    })

    const escaped = transformers.escape('text-[#ececec]')
    expect(escaped).toBe('text-_b_hececec_B')
    expect(transformers.unescape(escaped)).toBe('text-[#ececec]')
  })

  it('reuses the shared map when escape config omits map overrides', () => {
    const transformers = resolveTransformers({
      escape: {},
    })

    const escaped = transformers.escape('text-[#ececec]')
    expect(escaped).toBe('text-_b_hececec_B')
    expect(transformers.unescape(escaped)).toBe('text-[#ececec]')
  })

  it('applies shared map when unescape config omits map overrides', () => {
    const transformers = resolveTransformers({
      unescape: {},
    })

    const escaped = transformers.escape('text-[#ececec]')
    expect(escaped).toBe('text-_b_hececec_B')
    expect(transformers.unescape(escaped)).toBe('text-[#ececec]')
  })
})

describe('identity helper', () => {
  it('returns the provided value', () => {
    expect(identity('foo')).toBe('foo')
  })
})
