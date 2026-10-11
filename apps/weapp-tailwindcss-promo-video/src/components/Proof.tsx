import type { ReactNode } from 'react'
import type { Locale } from '../config'
import { C } from '../config'
import { copy } from '../content/copy'
import { Artwork } from './Interface'

export function CodeWindow({ title, children, width, fontSize = 30 }: { title: string, children: ReactNode, width: number, fontSize?: number }) {
  return (
    <div style={{ width, overflow: 'hidden', borderRadius: 22, border: '1px solid #6897B260', background: 'linear-gradient(130deg,#122C43,#061522)', boxShadow: '0 26px 70px #00000040' }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', height: 55, padding: '0 27px', borderBottom: '1px solid #578AA333' }}>
        {['#EB9A9A', '#E1CC92', '#84CCB0'].map(color => <i key={color} style={{ width: 8, height: 8, borderRadius: 8, background: color }} />)}
        <span className="mono" style={{ marginLeft: 15, color: C.muted, fontSize: 17 }}>{title}</span>
      </div>
      <div className="mono" style={{ padding: '25px 30px', fontSize, lineHeight: 1.8, color: '#B8E5F7' }}>{children}</div>
    </div>
  )
}
export function Tokens({ active = 2, vertical = false }: { active?: number, vertical?: boolean }) {
  return <div style={{ display: 'flex', gap: 12, flexDirection: vertical ? 'column' : 'row', flexWrap: 'wrap' }}>{['p-6', 'rounded-2xl', 'bg-sky-500'].map((token, i) => <span key={token} style={{ color: active === i ? '#C8FFE7' : '#8CABBD', background: active === i ? '#126F5355' : '#1C3A4B55', border: `1px solid ${active === i ? '#44CA9B' : '#41647A55'}`, padding: '5px 11px', borderRadius: 7 }}>{token}</span>)}</div>
}
export function LiveCard({ locale, step = 2, width = 640 }: { locale: Locale, step?: number, width?: number }) {
  const text = copy[locale].interface
  return (
    <div style={{ width, background: '#EDF3F5', color: '#153548', padding: 22, borderRadius: 25, boxShadow: '0 30px 60px #00000055' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <b className="mono" style={{ fontSize: 24, letterSpacing: 3 }}>
          FLOW
          <span style={{ color: C.blue }}>.</span>
        </b>
        <div style={{ width: 27, height: 27, borderRadius: 20, background: '#C8DEE7' }} />
      </div>
      <div style={{ padding: step >= 0 ? 24 : 8, borderRadius: step >= 1 ? 16 : 2, background: step >= 2 ? C.blue : '#B3C8D1' }}>
        <div style={{ height: width > 500 ? 164 : 122, borderRadius: 12, overflow: 'hidden' }}><Artwork locale={locale} /></div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: width > 500 ? 24 : 18, fontWeight: 700, marginTop: 17, color: '#FFFFFF' }}>
          <span>{text.card}</span>
          <span>↗</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>{text.tabs.map((tab, i) => <div key={tab} style={{ padding: '10px 13px', fontSize: width > 500 ? 17 : 13, borderRadius: 8, background: i ? '#DDE8EC' : '#12364C', color: i ? '#4D7185' : '#F3FAFF' }}>{tab}</div>)}</div>
    </div>
  )
}
