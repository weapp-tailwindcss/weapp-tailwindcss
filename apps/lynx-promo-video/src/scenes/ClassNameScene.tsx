import type { PromoCopy } from '../config'
import { DevelopmentCapture } from '../components/DevelopmentCapture'
import { eyebrowStyle, SceneShell } from '../components/SceneShell'
import { COLORS } from '../config'

export function ClassNameScene({ copy, locale }: { locale: 'zh' | 'en', copy: PromoCopy['classname'] }) {
  return (
    <SceneShell style={{ padding: '42px 70px 114px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ ...eyebrowStyle, fontSize: 18 }}>{copy.eyebrow}</div>
          <h2 style={{ margin: '8px 0 0', fontSize: 42, fontWeight: 720 }}>{copy.title}</h2>
        </div>
        <div style={{ textAlign: 'right', fontSize: 18, lineHeight: 1.65 }}>
          <div style={{ color: COLORS.green }}>{copy.runtimeNote}</div>
          <div style={{ color: COLORS.muted }}>{copy.jsxNote}</div>
        </div>
      </div>
      <DevelopmentCapture sceneId="classname" locale={locale} />
    </SceneShell>
  )
}
