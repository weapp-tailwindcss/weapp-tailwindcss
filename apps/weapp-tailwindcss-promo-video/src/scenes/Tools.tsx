import type { Locale } from '../config'
import { CodeWindow } from '../components/Proof'
import { Heading } from '../components/Stage'
import { C } from '../config'
import { copy } from '../content/copy'

export function Tools({ frame, locale }: { frame: number, locale: Locale }) {
  const text = copy[locale]
  const variant = frame >= 135
  return (
    <>
      <Heading locale={locale} scene="tools" portrait={false} horizontal />
      <div style={{ position: 'absolute', left: 112, top: 390, width: 955 }}>
        <div style={{ fontSize: 32, color: variant ? C.muted : C.ice, marginBottom: 24 }}>{text.toolsNames[0]}</div>
        <CodeWindow title="@weapp-tailwindcss/cli" width={955} fontSize={28}>
          <div style={{ whiteSpace: 'pre-wrap' }}>
            pnpm exec weapp-tw -i src/app.css -o dist/output.css
            <span style={{ color: '#7CE6AD', whiteSpace: 'nowrap' }}>--watch</span>
          </div>
          <div style={{ color: C.muted, marginTop: 20, whiteSpace: 'pre-wrap' }}>
            pnpm exec weapp-tw -i src/app.css -o dist/app.wxss
            <span style={{ color: '#7CE6AD', whiteSpace: 'nowrap' }}>--target weapp</span>
          </div>
        </CodeWindow>
        <div style={{ marginTop: 24, fontSize: 20, color: C.muted }}>{text.toolsNotes[0]}</div>
      </div>
      <div style={{ position: 'absolute', left: 1136, top: 390, width: 650 }}>
        <div style={{ fontSize: 32, color: variant ? C.ice : C.muted, marginBottom: 24 }}>{text.toolsNames[1]}</div>
        <div style={{ padding: '31px 27px', border: `1px solid ${variant ? '#49B89B' : '#386379'}`, borderRadius: 22, background: '#0B2133' }}>
          <div className="mono" style={{ fontSize: 27, color: '#8FE5BA', marginBottom: 30 }}>merge · variants · cva</div>
          {text.variants.map((label, i) => <div key={label} style={{ width: i === 2 ? 200 : 380, padding: i === 2 ? '10px 22px' : '16px 24px', borderRadius: 12, marginTop: 17, background: i === 1 ? 'transparent' : i === 2 ? '#1B8E65' : '#0EA5E9', border: `1px solid ${i === 1 ? '#63A6C4' : 'transparent'}`, fontSize: i === 2 ? 22 : 27, color: '#F3FBFF', transform: `translateX(${variant && Math.floor((frame - 135) / 40) % 3 === i ? 12 : 0}px)` }}>{label}</div>)}
        </div>
      </div>
    </>
  )
}
