import type { PromoLocale } from '../config'
import { interpolate, useCurrentFrame } from 'remotion'
import { COLORS, sceneAtFrame } from '../config'

export function Subtitles({ locale }: { locale: PromoLocale }) {
  const frame = useCurrentFrame()
  const scene = sceneAtFrame(frame, locale)
  if (!scene) {
    return null
  }
  const local = frame - scene.from
  const opacity = interpolate(local, [4, 14, scene.duration - 12, scene.duration - 3], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return (
    <div style={{ position: 'absolute', left: 160, right: 160, bottom: 46, display: 'flex', justifyContent: 'center', opacity, pointerEvents: 'none' }}>
      <div style={{ maxWidth: 1420, padding: '12px 22px 14px', borderRadius: 8, background: 'rgba(8, 12, 13, 0.88)', color: COLORS.text, fontSize: 28, lineHeight: 1.35, fontWeight: 560, textAlign: 'center' }}>
        {scene.subtitle}
      </div>
    </div>
  )
}
