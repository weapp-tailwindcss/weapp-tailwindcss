import type { PaidCampaign } from './campaigns'
import { describe, expect, it } from 'vitest'
import {
  assertNoCampaignOverlaps,
  fallbackCampaign,
  selectActiveCampaign,
  selectDisplayCampaign,
} from './campaigns'

function createCampaign(
  id: string,
  startsAt: string,
  endsAt: string,
  site: PaidCampaign['site'] = 'weapp-tailwindcss',
): PaidCampaign {
  return {
    creative: fallbackCampaign.creative,
    endsAt,
    href: `https://example.com/${id}`,
    id,
    site,
    startsAt,
  }
}

describe('sponsor campaign scheduling', () => {
  const monthly = createCampaign(
    'monthly',
    '2026-09-01T00:00:00.000Z',
    '2026-10-01T00:00:00.000Z',
  )
  const quarterly = createCampaign(
    'quarterly',
    '2026-09-01T00:00:00.000Z',
    '2026-11-30T00:00:00.000Z',
    'weapp-vite',
  )

  it('uses the fallback before and after a paid campaign', () => {
    expect(selectDisplayCampaign([monthly], monthly.site, fallbackCampaign, new Date('2026-08-31T23:59:59.999Z'))).toBe(fallbackCampaign)
    expect(selectDisplayCampaign([monthly], monthly.site, fallbackCampaign, new Date('2026-10-01T00:00:00.000Z'))).toBe(fallbackCampaign)
  })

  it('treats the start as inclusive and the end as exclusive for 30-day campaigns', () => {
    expect(selectActiveCampaign([monthly], monthly.site, new Date('2026-09-01T00:00:00.000Z'))).toBe(monthly)
    expect(selectActiveCampaign([monthly], monthly.site, new Date('2026-09-30T23:59:59.999Z'))).toBe(monthly)
    expect(selectActiveCampaign([monthly], monthly.site, new Date('2026-10-01T00:00:00.000Z'))).toBeUndefined()
  })

  it('keeps the same boundary rules for 90-day campaigns', () => {
    expect(selectActiveCampaign([quarterly], quarterly.site, new Date('2026-09-01T00:00:00.000Z'))).toBe(quarterly)
    expect(selectActiveCampaign([quarterly], quarterly.site, new Date('2026-11-29T23:59:59.999Z'))).toBe(quarterly)
    expect(selectActiveCampaign([quarterly], quarterly.site, new Date('2026-11-30T00:00:00.000Z'))).toBeUndefined()
  })

  it('rejects overlapping campaigns on the same site', () => {
    const overlapping = createCampaign(
      'overlapping',
      '2026-09-30T12:00:00.000Z',
      '2026-10-30T12:00:00.000Z',
    )

    expect(() => assertNoCampaignOverlaps([monthly, overlapping])).toThrow(/overlap/)
    expect(() => selectActiveCampaign([monthly, overlapping], monthly.site, new Date('2026-09-30T18:00:00.000Z'))).toThrow(/Multiple active/)
  })

  it('allows adjacent campaigns and independent schedules on different sites', () => {
    const adjacent = createCampaign(
      'adjacent',
      monthly.endsAt,
      '2026-10-31T00:00:00.000Z',
    )

    expect(() => assertNoCampaignOverlaps([monthly, adjacent, quarterly])).not.toThrow()
  })
})
