import type { PromoCopy } from '../config'
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { BrandMarks } from '../components/BrandMarks'
import { SceneShell } from '../components/SceneShell'
import { COLORS } from '../config'

export function CtaScene({ packageName, docsUrl, copy, qrAsset }: { packageName: string, docsUrl: string, copy: PromoCopy['cta'], qrAsset: string }) {
  const frame = useCurrentFrame()
  const qrScale = interpolate(frame, [12, 34], [0.92, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <SceneShell style={{ display: 'grid', gridTemplateColumns: '1fr 320px', alignItems: 'center', gap: 120 }}>
      <div>
        <BrandMarks size={64} />
        <h2 style={{ margin: '46px 0 0', fontSize: 72, lineHeight: 1.1, fontWeight: 730, letterSpacing: 0 }}>
          {copy.title[0]}
          <br />
          <span style={{ color: COLORS.green }}>{copy.title[1]}</span>
        </h2>
        <div className="mono" style={{ display: 'inline-block', marginTop: 42, padding: '17px 22px', border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.surface, color: '#dfe9e6', fontSize: 21 }}>
          pnpm add
          {packageName}
          {' '}
          tailwindcss
        </div>
        <div style={{ marginTop: 30, color: COLORS.muted, fontSize: 19 }}>{docsUrl}</div>
      </div>
      <div style={{ padding: 22, borderRadius: 8, background: '#f2f7f5', transform: `scale(${qrScale})` }}>
        <Img src={staticFile(qrAsset)} style={{ display: 'block', width: 276, height: 276 }} />
      </div>
    </SceneShell>
  )
}
