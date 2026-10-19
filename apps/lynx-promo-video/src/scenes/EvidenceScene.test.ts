import type { CSSProperties, ReactNode } from 'react'
import type { EvidenceSummary } from '../config'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { getPromoCopy } from '../config'
import { EvidenceScene } from './EvidenceScene'

vi.mock('remotion', () => ({
  AbsoluteFill: ({ children, style }: { children: ReactNode, style: CSSProperties }) => createElement('div', { style }, children),
  Img: ({ style, src }: { style: CSSProperties, src: string }) => createElement('img', { style, src }),
  interpolate: () => 1,
  staticFile: (file: string) => file,
  useCurrentFrame: () => 60,
}))

const evidence: EvidenceSummary = {
  total: 118,
  supported: 45,
  unsupported: 72,
  platformDifferences: 1,
  verifiedAt: '2026-10-06T01:38:07.800Z',
  versions: { tailwindcss: '4.3.3', lynxEngine: '4.0.1' },
}

describe('compatibility evidence provenance', () => {
  it.each(['zh', 'en'] as const)('shows baseline results separately from the current %s screenshot', (locale) => {
    const markup = renderToStaticMarkup(createElement(EvidenceScene, { evidence, locale, copy: getPromoCopy(locale).evidence }))
    const text = markup.replace(/<[^>]+>/g, '')
    expect(text).toContain('2026-10-06')
    expect(text).toContain(locale === 'zh' ? '45双端支持72双端不支持1平台差异' : '45Supported72Unsupported1Difference')
    expect(text).toContain(locale === 'zh' ? '已提交双端基线' : 'Committed iOS + Android baseline')
    expect(text).toContain(locale === 'zh' ? '当前实录 · Pixel 9 · Android 16' : 'Current capture · Pixel 9 · Android 16')
    expect(text).toContain(locale === 'zh' ? '统计取自左侧历史基线' : 'Counts use the historical baseline at left')
  })

  it('renders updated counts and verification date directly from the supplied baseline', () => {
    const updated = { ...evidence, supported: 44, unsupported: 70, platformDifferences: 4, verifiedAt: '2026-10-07T08:00:00.000Z' }
    const markup = renderToStaticMarkup(createElement(EvidenceScene, { evidence: updated, locale: 'en', copy: getPromoCopy('en').evidence }))
    const text = markup.replace(/<[^>]+>/g, '')
    expect(text).toContain('44Supported70Unsupported4Difference')
    expect(text).toContain('2026-10-07')
    expect(text).not.toContain('2026-10-06')
  })
})
