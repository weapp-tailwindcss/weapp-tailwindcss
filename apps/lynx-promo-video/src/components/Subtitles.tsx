import type { PromoLocale } from '../config'
import { interpolate, useCurrentFrame } from 'remotion'
import { COLORS } from '../config'
import subtitles from '../generated/subtitles.json'

export function Subtitles({ locale }: { locale: PromoLocale }) {
  const frame = useCurrentFrame()
  const cue = subtitles[locale].find(cue => frame >= cue.from && frame < cue.to)
  if (!cue) {
    return null
  }
  const duration = cue.to - cue.from
  const fade = Math.min(4, duration / 3)
  const opacity = interpolate(frame - cue.from, [0, fade, duration - fade, duration], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <div style={{ position: 'absolute', left: 160, right: 160, bottom: 46, display: 'flex', justifyContent: 'center', opacity, pointerEvents: 'none' }}>
      <div style={{ maxWidth: 1420, padding: '12px 22px 14px', borderRadius: 8, background: 'rgba(8, 12, 13, 0.88)', color: COLORS.text, fontSize: 28, lineHeight: 1.35, fontWeight: 560, textAlign: 'center' }}>
        {cue.text}
      </div>
    </div>
  )
}
