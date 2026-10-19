import type { EvidenceSummary, PromoCopy, PromoLocale } from '../config'
import { Img, interpolate, staticFile, useCurrentFrame } from 'remotion'
import { eyebrowStyle, SceneShell } from '../components/SceneShell'
import { COLORS } from '../config'

export function EvidenceScene({ evidence, copy, locale }: { evidence: EvidenceSummary, copy: PromoCopy['evidence'], locale: PromoLocale }) {
  const frame = useCurrentFrame()
  const imageOpacity = interpolate(frame, [8, 28], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const labels = locale === 'zh'
    ? { baseline: '已提交双端基线', supported: '双端支持', unsupported: '双端不支持', difference: '平台差异', capture: '当前实录 · Pixel 9 · Android 16', source: '截图展示当前运行；统计取自左侧历史基线。' }
    : { baseline: 'Committed iOS + Android baseline', supported: 'Supported', unsupported: 'Unsupported', difference: 'Difference', capture: 'Current capture · Pixel 9 · Android 16', source: 'Current runtime screenshot. Counts use the historical baseline at left.' }
  const statistics = [
    { label: labels.supported, value: evidence.supported },
    { label: labels.unsupported, value: evidence.unsupported },
    { label: labels.difference, value: evidence.platformDifferences },
  ]
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
        <div style={{ marginBottom: 16, color: COLORS.blue, fontSize: 20, lineHeight: 1.5 }}>
          {labels.baseline}
          {' · '}
          {evidence.verifiedAt.slice(0, 10)}
        </div>
        <div style={{ color: COLORS.muted, fontSize: 20, lineHeight: 1.65 }}>
          Tailwind CSS
          {' '}
          {evidence.versions.tailwindcss}
          <br />
          Lynx Engine
          {' '}
          {evidence.versions.lynxEngine}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginTop: 32 }}>
          {statistics.map(({ label, value }, index) => (
            <div key={label} style={{ padding: '22px 18px', borderTop: `2px solid ${index === 2 ? COLORS.green : COLORS.blue}`, background: COLORS.surface }}>
              <div className="mono" style={{ marginBottom: 10, color: COLORS.text, fontSize: 42, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 21, fontWeight: 680 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ position: 'relative', height: 710, overflow: 'hidden', border: `1px solid ${COLORS.border}`, borderRadius: 8, background: COLORS.surface, opacity: imageOpacity }}>
        <Img src={staticFile('captures/compatibility-lab.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top' }} />
        <div style={{ position: 'absolute', left: 20, right: 20, bottom: 20, padding: '16px 18px', borderRadius: 8, background: 'rgba(9, 13, 14, 0.92)', color: '#cbd7d4', fontSize: 18, lineHeight: 1.5 }}>
          <div style={{ color: COLORS.green, fontWeight: 680 }}>{labels.capture}</div>
          <div style={{ marginTop: 6, color: '#cbd7d4' }}>{labels.source}</div>
        </div>
      </div>
    </SceneShell>
  )
}
