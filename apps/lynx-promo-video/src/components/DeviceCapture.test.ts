import type { CSSProperties } from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { promoPropsForLocale } from '../config'
import { LynxPromoCover } from '../video/LynxPromoCover'
import { DeviceCapture } from './DeviceCapture'

vi.mock('remotion', () => ({
  OffthreadVideo: ({ style, src }: { style: CSSProperties, src: string }) => createElement('video', { style, src }),
  Img: ({ style, src }: { style: CSSProperties, src: string }) => createElement('img', { style, src }),
  staticFile: (file: string) => file,
}))

describe('complete native capture framing', () => {
  it.each(['ios', 'android'] as const)('preserves the intrinsic %s screen ratio without a decorative notch', (platform) => {
    const markup = renderToStaticMarkup(createElement(DeviceCapture, { platform, width: 350 }))
    expect(markup).toContain(`src="captures/${platform}.mp4"`)
    expect(markup).toContain('width:100%;height:auto')
    expect(markup).not.toMatch(/height:\d+px|height:100%|object-fit:cover/)
    expect(markup).not.toContain('position:absolute')
  })

  it.each(['zh', 'en'] as const)('preserves both complete screen images on the %s cover', (locale) => {
    const markup = renderToStaticMarkup(createElement(LynxPromoCover, promoPropsForLocale(locale)))
    const screens = markup.match(/<img[^>]+src="captures\/(?:ios|android)-cover\.png"[^>]*>/g) ?? []
    expect(screens).toHaveLength(2)
    for (const screen of screens) {
      expect(screen).toContain('width:100%;height:auto')
      expect(screen).not.toContain('object-fit:cover')
    }
    expect(markup).not.toContain('height:738px')
  })
})
