import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { createJsHandler } from '@/js'
import { replaceWxml } from '@/wxml/shared'

function createStrictHandler() {
  return createJsHandler({
    escapeMap: MappingChars2String,
    jsArbitraryValueFallback: false,
  })
}

function createLegacyFallbackHandler() {
  return createJsHandler({
    escapeMap: MappingChars2String,
    jsArbitraryValueFallback: 'auto',
    tailwindcssMajorVersion: 4,
  })
}

describe('framework dynamic class regression', () => {
  it('transforms uni-app runtime helper template literals with escaped runtime-set entries', async () => {
    const handler = createStrictHandler()
    const escapedGap = replaceWxml('gap-[20px]')
    const runtimeSet = new Set(['flex', escapedGap])
    const source = 'const e={r(payload){return payload}};e.r([`flex gap-[20px]`])'

    const { code } = await handler(source, runtimeSet)

    expect(code).toContain(escapedGap)
    expect(code).not.toContain('gap-[20px]')
  })

  it('transforms taro-vite className literals with arbitrary values', async () => {
    const handler = createStrictHandler()
    const runtimeSet = new Set([
      'h-[300px]',
      'text-[#c31d6b]',
      'bg-[#123456]',
    ])
    const source = 'const node={className:"h-[300px] text-[#c31d6b] bg-[#123456]"}'

    const { code } = await handler(source, runtimeSet)

    expect(code).toContain('h-_b300px_B')
    expect(code).toContain('text-_b_hc31d6b_B')
    expect(code).toContain('bg-_b_h123456_B')
    expect(code).not.toContain('h-[300px]')
    expect(code).not.toContain('text-[#c31d6b]')
    expect(code).not.toContain('bg-[#123456]')
  })

  it('transforms taro-webpack className literals with arbitrary values', async () => {
    const handler = createStrictHandler()
    const runtimeSet = new Set([
      'bg-[#534312]',
      'text-[#fff]',
      'text-[100rpx]',
    ])
    const source = 'const node={className:"bg-[#534312] text-[#fff] text-[100rpx]"}'

    const { code } = await handler(source, runtimeSet)

    expect(code).toContain('bg-_b_h534312_B')
    expect(code).toContain('text-_b_hfff_B')
    expect(code).toContain('text-_b100rpx_B')
    expect(code).not.toContain('bg-[#534312]')
    expect(code).not.toContain('text-[#fff]')
    expect(code).not.toContain('text-[100rpx]')
  })

  it('transforms mpx data literals when runtime-set provides matching class names', async () => {
    const handler = createStrictHandler()
    const runtimeSet = new Set([
      'bg-[#010101]',
      'active:bg-[#989898]',
    ])
    const source = 'const state={data:{clsnm:"bg-[#010101] active:bg-[#989898]"}}'

    const { code } = await handler(source, runtimeSet)

    expect(code).toContain('bg-_b_h010101_B')
    expect(code).toContain('active_cbg-_b_h989898_B')
    expect(code).not.toContain('bg-[#010101]')
    expect(code).not.toContain('active:bg-[#989898]')
  })

  it('fails closed for className arbitrary values when runtime-set is empty', async () => {
    const handler = createLegacyFallbackHandler()
    const source = 'const node={className:"h-[300px] text-[#c31d6b] bg-[#123456]"}'

    const { code } = await handler(source, new Set())

    expect(code).toBe(source)
  })

  it('fails closed for non-class-like mpx keys when runtime-set is empty', async () => {
    const handler = createLegacyFallbackHandler()
    const source = 'const state={data:{clsnm:"bg-[#010101] active:bg-[#989898]"}}'

    const { code } = await handler(source, new Set())

    expect(code).toContain('clsnm:"bg-[#010101] active:bg-[#989898]"')
    expect(code).not.toContain('bg-_b_h010101_B')
    expect(code).not.toContain('active_cbg-_b_h989898_B')
  })

  it.each([
    ['uni-app', 'const state={class:"text-[45rpx]"}'],
    ['taro-vite', 'const node={className:"w-[100px]"}'],
    ['taro-webpack', 'const node={className:"bg-[#123456]"}'],
    ['mpx', 'const state={data:{clsnm:"h-[200px]"}}'],
    ['gulp', 'const classes="gap-[20px]"'],
  ])('preserves %s JavaScript when Tailwind confirms no classes', async (_framework, source) => {
    const handler = createLegacyFallbackHandler()

    expect(handler(source, new Set())).toMatchObject({ code: source })
  })
})
