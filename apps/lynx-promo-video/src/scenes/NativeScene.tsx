import type { PromoCopy } from '../config'
import { interpolate, useCurrentFrame } from 'remotion'
import { DeviceCapture } from '../components/DeviceCapture'
import { SceneShell } from '../components/SceneShell'
import { COLORS } from '../config'

export function NativeScene({ copy }: { copy: PromoCopy['native'] }) {
  const frame = useCurrentFrame()
  const iosX = interpolate(frame, [0, 34], [-120, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const androidX = interpolate(frame, [0, 34], [120, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <SceneShell style={{ paddingTop: 60 }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div style={{ color: COLORS.green, fontFamily: 'JetBrains Mono Variable, monospace', fontSize: 22, fontWeight: 650 }}>{copy.eyebrow}</div>
          <h2 style={{ margin: '18px 0 0', fontSize: 64, lineHeight: 1.12, fontWeight: 720, letterSpacing: 0 }}>
            {copy.title[0]}
            <br />
            {copy.title[1]}
          </h2>
        </div>
        <div className="mono" style={{ color: COLORS.muted, fontSize: 18, textAlign: 'right', lineHeight: 1.7 }}>
          ReactLynx
          <br />
          Lynx Engine 4.0.1
        </div>
      </div>
      <div style={{ position: 'absolute', left: 700, right: 110, bottom: 80, top: 48, display: 'flex', justifyContent: 'space-around', alignItems: 'center' }}>
        <div style={{ transform: `translateX(${iosX}px)` }}><DeviceCapture platform="ios" width={350} startFrom={70} /></div>
        <div style={{ transform: `translateX(${androidX}px)` }}><DeviceCapture platform="android" width={350} startFrom={70} /></div>
      </div>
      <div style={{ position: 'absolute', left: 112, bottom: 238, width: 390, color: COLORS.muted, fontSize: 22, lineHeight: 1.65 }}>{copy.note}</div>
    </SceneShell>
  )
}
