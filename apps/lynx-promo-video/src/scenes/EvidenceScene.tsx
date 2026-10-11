import type { EvidenceSummary, PromoCopy } from '../config'
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { eyebrowStyle, SceneShell } from '../components/SceneShell'
import { COLORS } from '../config'

export function EvidenceScene({ evidence, copy }: { evidence: EvidenceSummary, copy: PromoCopy['evidence'] }) {
  const frame = useCurrentFrame()
  const imageOpacity = interpolate(frame, [8, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <SceneShell style={{ display: 'grid', gridTemplateColumns: '1.08fr 0.92fr', gap: 72, alignItems: 'center' }}>
      <div>
        <div style={eyebrowStyle}>{copy.eyebrow}</div>
        <h2 style={{ margin: '18px 0 24px', fontSize: 64, lineHeight: 1.12, fontWeight: 720, letterSpacing: 0 }}>
          {evidence.total}
          {' '}
          {copy.title[0]}
          <br />
          {copy.title[1]}
        </h2>
        <div style={{ color: COLORS.muted, fontSize: 20, lineHeight: 1.65 }}>
          Tailwind CSS
          {evidence.versions.tailwindcss}
          <br />
          Lynx Engine
          {' '}
          {evidence.versions.lynxEngine}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 44 }}>
          {copy.cards.map(({ label, detail }, index) => (
            <div key={label} style={{ padding: '22px 18px', borderTop: `2px solid ${index === 2 ? COLORS.green : COLORS.blue}`, background: COLORS.surface }}>
              <div style={{ fontSize: 21, fontWeight: 680 }}>{label}</div>
              <div className="mono" style={{ marginTop: 10, color: COLORS.muted, fontSize: 14 }}>{detail}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative', height: 710, overflow: 'hidden', border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.surface, opacity: imageOpacity }}>
        <Img src={staticFile('captures/compatibility-lab.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 20, padding: '16px 18px', borderRadius: 8, background: 'rgba(9, 13, 14, 0.92)', color: '#cbd7d4', fontSize: 17 }}>{copy.note}</div>
      </div>
    </SceneShell>
  )
}
