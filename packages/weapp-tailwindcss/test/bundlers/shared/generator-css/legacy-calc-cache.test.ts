import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import { createStyleHandler } from '@weapp-tailwindcss/postcss'
import { describe, expect, it } from 'vitest'
import { appendLegacyCompatCss } from '@/generation/legacy-compat'

describe('legacy compat calc cache', () => {
  const createHandler = () => createStyleHandler({ cssPreflight: false, cssPresetEnv: { features: { 'custom-properties': false } } })
  const handlerOptions = { isMainChunk: false, majorVersion: 4 } as IStyleHandlerOptions

  it('regenerates legacy CSS when an explicit variable map changes', async () => {
    const generate = (spacing: string) => appendLegacyCompatCss(
      '', '.legacy-map-size{width:calc(var(--spacing)*32)}', 'weapp', createHandler(), handlerOptions,
      { cssCalc: ['--spacing'], customPropertyValues: new Map([['--spacing', spacing]]) },
    )
    expect(await generate('1rpx')).toContain('width:32rpx')
    expect(await generate('2rpx')).toContain('width:64rpx')
  })

  it('honors changed regex source and flags instead of returning a cached static value', async () => {
    const generate = (pattern: RegExp) => appendLegacyCompatCss(
      '', '.legacy-regex-size{width:calc(var(--spacing)*32)}', 'weapp', createHandler(), handlerOptions,
      { cssCalc: [pattern], customPropertyValues: new Map([['--spacing', '1rpx']]) },
    )
    expect(await generate(/^--spacing$/)).toContain('width:32rpx')
    expect(await generate(/^--SPACING$/)).toMatch(/width:calc\(var\(--spacing\)\s*\*\s*32\)/)
    expect(await generate(/^--SPACING$/i)).toContain('width:32rpx')
  })
})
