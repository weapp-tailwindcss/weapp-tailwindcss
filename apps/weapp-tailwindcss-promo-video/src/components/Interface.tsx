import type { Locale } from '../config'
import { C } from '../config'
import { copy } from '../content/copy'

export function Artwork({ color = 'blue', locale = 'zh' }: { color?: 'blue' | 'green', locale?: Locale }) {
  const green = color === 'green'
  return (
    <div style={{ height: '100%', width: '100%', background: green ? 'linear-gradient(150deg,#164841,#05211D)' : 'linear-gradient(150deg,#1B5B82,#071D38)', overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', width: '90%', height: '145%', left: '20%', top: '-30%', borderRadius: '50%', border: `28px solid ${green ? '#5ADAB5' : '#7FD7FA'}`, boxShadow: `inset 0 0 25px ${green ? '#137E72' : '#087EC0'}, 0 0 55px #78E8FF40`, transform: 'rotate(-40deg) scaleX(.58)' }} />
      <div style={{ position: 'absolute', width: '66%', height: '118%', left: '13%', top: '-5%', borderRadius: '50%', border: `12px solid ${green ? '#CDF7C8' : '#D4FFFF'}`, transform: 'rotate(32deg) scaleX(.58)', opacity: 0.75 }} />
      <div style={{ position: 'absolute', right: '10%', top: '12%', width: 11, height: 11, borderRadius: '50%', background: '#C8FCEB', boxShadow: '0 0 20px #9CFFE6' }} />
      <div className="mono" style={{ position: 'absolute', left: 24, bottom: 22, fontSize: 12, color: '#D2F6FF', letterSpacing: 4 }}>{copy[locale].interface.art}</div>
    </div>
  )
}

export function Interface({ compact = false, progress = 1, color = 'blue', locale = 'zh' }: { compact?: boolean, progress?: number, color?: 'blue' | 'green', locale?: Locale }) {
  const accent = color === 'green' ? C.green : C.blue
  return (
    <div style={{ background: '#F2F5F5', color: '#112C3D', height: '100%', padding: compact ? 22 : 30, fontFamily: 'Noto Sans SC Variable', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: compact ? 24 : 35 }}>
        <div className="mono" style={{ fontWeight: 800, fontSize: compact ? 19 : 23, letterSpacing: 5 }}>
          FLOW
          <span style={{ color: accent }}>.</span>
        </div>
        <div style={{ width: 30, height: 30, background: '#D9E8EE', borderRadius: 20, display: 'grid', placeItems: 'center', fontSize: 13 }}>F</div>
      </div>
      <div className="mono" style={{ color: '#668292', fontSize: 10, letterSpacing: 3, marginBottom: 11 }}>{copy[locale].interface.daily}</div>
      <div style={{ fontSize: compact ? 29 : 36, fontWeight: 750, lineHeight: 1.4, letterSpacing: -1 }}>
        {copy[locale].interface.title}
        <span style={{ color: accent }}>{locale === 'zh' ? '。' : '.'}</span>
      </div>
      <div style={{ marginTop: 12, color: '#6B8390', fontSize: compact ? 12 : 14 }}>{copy[locale].interface.subtitle}</div>
      <div style={{ padding: 6 + progress * 5, marginTop: compact ? 23 : 30, borderRadius: 4 + progress * 21, background: progress > 0.5 ? accent : '#BBCDD8', boxShadow: '0 16px 30px #163C5619' }}>
        <div style={{ height: compact ? 176 : 226, borderRadius: 2 + progress * 13, overflow: 'hidden' }}><Artwork color={color} locale={locale} /></div>
        <div style={{ padding: '17px 13px 10px', color: '#FFFFFF' }}>
          <div style={{ fontSize: compact ? 18 : 21, fontWeight: 650 }}>
            {copy[locale].interface.card}
            <span style={{ float: 'right' }}>↗</span>
          </div>
          <div className="mono" style={{ opacity: 0.8, fontSize: 9, letterSpacing: 3, marginTop: 9 }}>DESIGN / EXPLORE / CREATE</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 25 }}>
        {copy[locale].interface.tabs.map((label, i) => <div key={label} style={{ flex: 1, padding: '13px 3px', borderRadius: 12, textAlign: 'center', background: i === 0 ? '#17354A' : '#E2EBEF', color: i === 0 ? '#FFFFFF' : '#5B7484', fontSize: 11 }}>{label}</div>)}
      </div>
      <div style={{ marginTop: 26, borderTop: '1px solid #D6E3E9', paddingTop: 21, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 650 }}>{copy[locale].interface.color}</div>
          <div style={{ fontSize: 11, color: '#8298A5', marginTop: 8 }}>A little color. A new perspective.</div>
        </div>
        <div style={{ display: 'flex' }}>{['#07C160', '#0EA5E9', '#AEDBE5'].map(c => <div key={c} style={{ width: 23, height: 23, borderRadius: '50%', background: c, border: '2px solid white', marginLeft: -7 }} />)}</div>
      </div>
    </div>
  )
}

export function Phone({ width = 370, color = 'blue', progress = 1, rotate = 0, locale = 'zh' }: { width?: number, color?: 'blue' | 'green', progress?: number, rotate?: number, locale?: Locale }) {
  const scale = width / 400
  return (
    <div style={{ width, height: 794 * scale, position: 'relative', transform: `rotate(${rotate}deg)`, filter: 'drop-shadow(0 38px 45px #00000060)' }}>
      <div style={{ width: 400, height: 794, transform: `scale(${scale})`, transformOrigin: 'top left', padding: 10, border: '1px solid #94B9C980', borderRadius: 53, background: 'linear-gradient(125deg,#97ACB7,#1B3340 20%,#07141F 75%,#6F8C9B)', boxShadow: 'inset 0 0 0 3px #203846' }}>
        <div style={{ height: '100%', overflow: 'hidden', borderRadius: 42, background: '#F2F5F5' }}>
          <div style={{ height: 43, display: 'flex', justifyContent: 'space-between', padding: '14px 28px', color: '#183548', fontSize: 12, fontWeight: 700 }}>
            <span>9:41</span>
            <span>••• ▰</span>
          </div>
          <Interface progress={progress} color={color} locale={locale} />
        </div>
        <div style={{ position: 'absolute', top: 18, width: 101, height: 24, left: 149, borderRadius: 20, background: '#07121C' }} />
        <div style={{ position: 'absolute', bottom: 19, left: 145, width: 110, height: 4, borderRadius: 5, background: '#122C3D' }} />
      </div>
    </div>
  )
}

export function Browser({ width = 790, locale = 'zh' }: { width?: number, locale?: Locale }) {
  const scale = width / 900
  return (
    <div style={{ width, height: 615 * scale, filter: 'drop-shadow(0 35px 50px #00000060)' }}>
      <div style={{ width: 900, height: 615, borderRadius: 24, border: '1px solid #99C2DC75', overflow: 'hidden', background: '#DFE9EE', transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <div style={{ height: 46, display: 'flex', alignItems: 'center', padding: '0 20px', gap: 8 }}>
          {['#F38282', '#E6C26D', '#6AB8A5'].map(c => <span key={c} style={{ width: 9, height: 9, borderRadius: '50%', background: c }} />)}
          <div className="mono" style={{ margin: '0 auto', color: '#8295A4', fontSize: 10 }}>flow / creative space</div>
        </div>
        <div style={{ display: 'flex', height: 569 }}>
          <div style={{ width: 170, padding: 26, background: '#E6EEF0', color: '#6A8495' }}>
            <div className="mono" style={{ fontSize: 24, fontWeight: 800, color: '#193C52', marginBottom: 47 }}>FLOW.</div>
            {copy[locale].interface.side.map((t, i) => <div key={t} style={{ fontSize: 13, marginBottom: 32, color: i === 0 ? '#147E9C' : '#78929F' }}>{t}</div>)}
            <div className="mono" style={{ fontSize: 10, marginTop: 65, color: '#86A4B3', letterSpacing: 3 }}>
              MAKE IT
              <br />
              YOURS.
            </div>
          </div>
          <div style={{ width: 398 }}><Interface compact locale={locale} /></div>
          <div style={{ flex: 1, padding: '32px 24px', background: '#F2F5F5' }}>
            <div style={{ fontSize: 14, color: '#3D6072', marginBottom: 22 }}>{copy[locale].interface.palette}</div>
            <div style={{ height: 190, borderRadius: 20, overflow: 'hidden' }}><Artwork color="green" locale={locale} /></div>
            <div className="mono" style={{ fontSize: 11, color: '#79939D', letterSpacing: 3, marginTop: 25 }}>YOUR PALETTE</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 18 }}>{['#0EA5E9', '#07C160', '#15384E', '#ABCEDC'].map(c => <div key={c} style={{ background: c, width: 44, height: 54, borderRadius: 9 }} />)}</div>
            <div style={{ marginTop: 26, fontSize: 20, fontWeight: 700, color: '#224658' }}>{copy[locale].interface.create}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
