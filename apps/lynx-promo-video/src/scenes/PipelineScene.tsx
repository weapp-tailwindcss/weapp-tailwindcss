import type { PromoCopy } from '../config'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { eyebrowStyle, SceneShell, titleStyle } from '../components/SceneShell'
import { COLORS } from '../config'

const pipeline = [
  { label: 'TSX', detail: 'static className' },
  { label: 'Tailwind CSS 4', detail: 'candidate generation' },
  { label: 'Rspeedy', detail: 'Rspack lifecycle' },
  { label: 'CSS', detail: 'Lynx compatible' },
  { label: 'Lynx bundle', detail: 'native runtime' },
] as const

export function PipelineScene({ copy }: { copy: PromoCopy['pipeline'] }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  return (
    <SceneShell>
      <div style={eyebrowStyle}>{copy.eyebrow}</div>
      <h2 style={{ ...titleStyle, marginTop: 20 }}>{copy.title}</h2>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(9, auto)', alignItems: 'center', justifyContent: 'space-between', marginTop: 120 }}>
        {pipeline.map((item, index) => {
          const progress = spring({ frame: frame - 24 - index * 24, fps, config: { damping: 18, stiffness: 110 } })
          return (
            <div key={item.label} style={{ display: 'contents' }}>
              <div style={{ width: index === 1 ? 260 : 210, minHeight: 142, padding: '26px 24px', border: `1px solid ${index === pipeline.length - 1 ? COLORS.green : COLORS.border}`, borderRadius: 8, background: index === pipeline.length - 1 ? '#10241b' : COLORS.surface, opacity: progress, transform: `translateY(${(1 - progress) * 36}px)` }}>
                <div style={{ color: index === pipeline.length - 1 ? '#75dfa6' : COLORS.text, fontSize: 27, fontWeight: 680 }}>{item.label}</div>
                <div className="mono" style={{ marginTop: 16, color: COLORS.muted, fontSize: 15, lineHeight: 1.45 }}>{item.detail}</div>
              </div>
              {index < pipeline.length - 1 && (
                <div style={{ color: COLORS.blue, fontSize: 38, opacity: interpolate(frame, [42 + index * 24, 58 + index * 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>→</div>
              )}
            </div>
          )
        })}
      </div>
      <div style={{ marginTop: 76, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${COLORS.border}`, paddingTop: 28 }}>
        <div style={{ color: COLORS.muted, fontSize: 21 }}>{copy.note}</div>
        <div className="mono" style={{ color: COLORS.green, fontSize: 19 }}>main.lynx.bundle</div>
      </div>
    </SceneShell>
  )
}
