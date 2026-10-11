import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { collectGeneratedRawSourceCandidatesFromCss } from '@/generation/class-selectors'

describe('generated CSS class selectors', () => {
  it('unions verified classes across generated and cached CSS without source-scan pollution', () => {
    const candidates = new Set([
      'user/getUserInfo',
      'order/get_order_amount',
      'pages/order/detail',
      'text/event-stream',
      'w-1/2',
      'bg-red-500/50',
      'text-[45rpx]',
      'shadow-lg',
    ])
    const cssSources = [
      '.w-1_f2{width:50%}.bg-red-500_f50{background-color:#f006}',
      '.text-_b45rpx_B{font-size:45rpx}.shadow-lg{box-shadow:var(--tw-shadow)}',
    ]

    expect(collectGeneratedRawSourceCandidatesFromCss(
      candidates,
      cssSources,
      MappingChars2String,
    )).toEqual(new Set([
      'w-1/2',
      'bg-red-500/50',
      'text-[45rpx]',
      'shadow-lg',
    ]))
  })
})
