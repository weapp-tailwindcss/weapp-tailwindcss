import type { Locale } from '../config'
import { Img, staticFile } from 'remotion'
import { Heading } from '../components/Stage'
import { C } from '../config'
import { copy } from '../content/copy'

export function Pipeline({ frame, locale }: { frame: number, locale: Locale }) {
  const text = copy[locale]
  const selected = Math.min(2, Math.floor(frame / 60))
  return (
    <>
      <Heading locale={locale} scene="pipeline" portrait={false} horizontal />
      <svg width="1920" height="1080" style={{ position: 'absolute', inset: 0 }}>
        <path d="M155 591 L1770 591" stroke="#22536D" strokeWidth="3" />
        <path d="M155 591 L1770 591" stroke={C.green} strokeWidth="5" strokeDasharray="160 1500" strokeDashoffset={-frame * 10} />
      </svg>
      {text.pipelineSteps.map((step, i) => (
        <div key={step} style={{ position: 'absolute', left: 110 + i * 574, top: 438, width: 538, height: 279, padding: '34px 33px', border: `1px solid ${selected === i ? '#63D7BA' : '#36647E'}`, borderRadius: 24, background: selected === i ? 'linear-gradient(130deg,#164337,#0B243A)' : '#0B1E31', boxShadow: selected === i ? '0 0 70px #07C16018' : undefined }}>
          <div className="mono" style={{ fontSize: 22, color: C.green }}>
            {String(i + 1).padStart(2, '0')}
            {' '}
            <span style={{ color: '#4E7B94' }}> / 03</span>
          </div>
          <div style={{ fontSize: 48, fontWeight: 740, marginTop: 20 }}>{step}</div>
          <div style={{ color: C.ice, fontSize: 24, marginTop: 16 }}>{text.pipelineDetails[i]}</div>
        </div>
      ))}
      <div style={{ position: 'absolute', left: 115, top: 794, display: 'flex', alignItems: 'center', gap: 22 }}>
        <Img src={staticFile('brand/logo.svg')} style={{ width: 55 }} />
        <span className="mono" style={{ color: C.muted, fontSize: 26 }}>weapp-tailwindcss</span>
      </div>
      <div style={{ position: 'absolute', right: 118, top: 809, display: 'flex', gap: 27, color: C.ice, fontSize: 24 }}>{text.outputLabels.map(label => <span key={label}>{label}</span>)}</div>
    </>
  )
}
