import type { Locale } from '../config'
import { Img, staticFile } from 'remotion'
import { Heading } from '../components/Stage'
import { C } from '../config'
import { copy } from '../content/copy'

const frameworks = [{ label: 'uni-app', image: 'uni-app.svg' }, { label: 'Taro', image: 'taro.png' }, { label: 'Mpx', image: 'mpx.png' }, { label: 'weapp-vite', image: 'weapp-vite.svg' }]
const builders = ['Vite', 'Webpack', 'Rspack', 'Gulp']
export function Ecosystem({ frame, portrait: p, locale }: { frame: number, portrait: boolean, locale: Locale }) {
  const text = copy[locale]
  const selected = Math.floor(frame / 45) % 4
  return (
    <>
      <Heading locale={locale} scene="ecosystem" portrait={p} horizontal />
      <div data-safe="ecosystem" style={{ position: 'absolute', left: p ? 80 : 111, top: p ? 588 : 380, width: p ? 820 : 1694 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 26, padding: p ? '19px 26px' : '18px 30px', border: '1px solid #3C99A574', borderRadius: 20, background: 'linear-gradient(100deg,#0C4642,#0B233C)' }}>
          <div className="mono" style={{ fontSize: p ? 45 : 51, color: '#B9F3EC', fontWeight: 750 }}>
            Tailwind CSS
            <span style={{ color: '#68F2B2', marginLeft: 14 }}>4</span>
          </div>
          <Img src={staticFile('brand/logo.svg')} style={{ width: p ? 61 : 64, marginLeft: 'auto' }} />
        </div>
        <div style={{ color: C.muted, fontSize: p ? 24 : 23, marginTop: 28, marginBottom: 16 }}>{text.frameworkLabel}</div>
        <div style={{ display: 'grid', gridTemplateColumns: p ? 'repeat(2, 1fr)' : 'repeat(4,1fr)', gap: 16 }}>
          {frameworks.map((item, i) => (
            <div key={item.label} style={{ height: p ? 121 : 128, border: `1px solid ${selected === i ? '#5CCFAC' : '#335972'}`, borderRadius: 16, background: '#0B2134', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 17 }}>
              <Img src={staticFile(`brand/${item.image}`)} style={{ width: p ? 48 : 58, height: p ? 48 : 58, objectFit: 'contain' }} />
              <span className="mono" style={{ fontSize: p ? 29 : 33 }}>{item.label}</span>
            </div>
          ))}
        </div>
        <div style={{ color: C.muted, fontSize: p ? 24 : 23, marginTop: 29, marginBottom: 18 }}>{text.builderLabel}</div>
        <div className="mono" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 11, fontSize: p ? 25 : 32 }}>{builders.map(label => <div key={label} style={{ borderBottom: '2px solid #38647A', padding: '15px 0', textAlign: 'center', color: C.ice }}>{label}</div>)}</div>
      </div>
    </>
  )
}
