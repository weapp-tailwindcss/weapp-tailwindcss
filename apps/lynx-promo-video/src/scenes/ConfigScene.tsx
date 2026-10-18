import type { PromoCopy } from '../config'
import { DevelopmentCapture } from '../components/DevelopmentCapture'
import { eyebrowStyle, SceneShell } from '../components/SceneShell'
import { COLORS } from '../config'

export function ConfigScene({ copy }: { copy: PromoCopy['config'] }) {
  return (
    <SceneShell style={{ padding: '42px 70px 114px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ ...eyebrowStyle, fontSize: 18 }}>{copy.eyebrow}</div>
          <h2 style={{ margin: '8px 0 0', fontSize: 42, fontWeight: 720 }}>{copy.title}</h2>
        </div>
        <div className="mono" style={{ color: COLORS.muted, fontSize: 19 }}>{copy.note}</div>
      </div>
      <DevelopmentCapture sceneId="config" />
    </SceneShell>
  )
}
