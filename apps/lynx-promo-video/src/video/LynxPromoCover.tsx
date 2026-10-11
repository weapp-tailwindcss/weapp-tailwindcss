import type { LynxPromoProps } from '../config'
import { Img, staticFile } from 'remotion'
import { BrandMarks } from '../components/BrandMarks'
import { COLORS } from '../config'

export function LynxPromoCover({ packageName, copy }: LynxPromoProps) {
  return (
    <div style={{ width: '100%', height: '100%', padding: '96px 112px', display: 'grid', gridTemplateColumns: '1.18fr 0.82fr', alignItems: 'center', gap: 80, overflow: 'hidden', background: COLORS.background, color: COLORS.text }}>
      <div>
        <BrandMarks size={72} />
        <h1 style={{ margin: '54px 0 0', fontSize: 88, lineHeight: 1.08, fontWeight: 740, letterSpacing: 0 }}>
          {copy.hook.title[0]}
          <br />
          <span style={{ color: COLORS.green }}>{copy.hook.title[1]}</span>
        </h1>
        <div className="mono" style={{ marginTop: 44, color: COLORS.muted, fontSize: 24 }}>{packageName}</div>
      </div>
      <div style={{ position: 'relative', height: 900 }}>
        <div style={{ position: 'absolute', left: 10, top: 82, width: 365, height: 738, padding: 9, border: `1px solid ${COLORS.border}`, borderRadius: 42, background: '#050708', transform: 'rotate(-4deg)' }}>
          <Img src={staticFile('captures/ios-cover.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 33 }} />
        </div>
        <div style={{ position: 'absolute', right: 0, top: 24, width: 365, height: 738, padding: 9, border: `1px solid ${COLORS.border}`, borderRadius: 42, background: '#050708', transform: 'rotate(4deg)' }}>
          <Img src={staticFile('captures/android-cover.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 33 }} />
        </div>
      </div>
    </div>
  )
}
