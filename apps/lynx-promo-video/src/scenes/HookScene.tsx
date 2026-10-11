import type { PromoCopy } from '../config'
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion'
import { BrandMarks } from '../components/BrandMarks'
import { DeviceCapture } from '../components/DeviceCapture'
import { SceneShell } from '../components/SceneShell'
import { COLORS } from '../config'

export function HookScene({ copy }: { copy: PromoCopy['hook'] }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const deviceProgress = spring({ frame: frame - 12, fps, config: { damping: 18, stiffness: 105 } })
  const codeProgress = interpolate(frame, [72, 112], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <SceneShell style={{ display: 'grid', gridTemplateColumns: '1.12fr 0.88fr', alignItems: 'center', gap: 80 }}>
      <div>
        <BrandMarks />
        <h1 style={{ margin: '54px 0 0', maxWidth: 940, fontSize: 86, lineHeight: 1.08, fontWeight: 730, letterSpacing: 0 }}>
          {copy.title[0]}
          <br />
          <span style={{ color: COLORS.green }}>{copy.title[1]}</span>
        </h1>
        <div className="mono" style={{ marginTop: 38, color: COLORS.muted, fontSize: 23 }}>
          className=
          <span style={{ color: '#86d8aa', opacity: codeProgress }}>"flex rounded-[18px] bg-[#0d1112] p-6"</span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', opacity: deviceProgress, transform: `translateY(${(1 - deviceProgress) * 90}px) scale(${0.94 + deviceProgress * 0.06})` }}>
        <DeviceCapture platform="ios" width={370} />
      </div>
    </SceneShell>
  )
}
