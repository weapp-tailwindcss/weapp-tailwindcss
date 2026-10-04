import type { Locale } from '../config'
import { Img, staticFile } from 'remotion'
import { CodeWindow, LiveCard, Tokens } from '../components/Proof'
import { Ribbon } from '../components/Ribbon'
import { Accent, Brand } from '../components/Stage'
import { C } from '../config'
import { copy } from '../content/copy'

export function Opening({ frame, portrait: p, locale, cover = false }: { frame: number, portrait: boolean, locale: Locale, cover?: boolean }) {
  const text = copy[locale]
  return (
    <>
      <div data-safe="hook" style={{ position: 'absolute', left: p ? 80 : 104, top: p ? 325 : 234, width: p ? 820 : 950 }}>
        <div style={{ fontSize: p ? 25 : 24, color: C.ice, marginBottom: 30 }}>{text.hookTag}</div>
        <div style={{ fontSize: p ? 91 : 112, fontWeight: 820, letterSpacing: -4, lineHeight: 1.15 }}>
          {text.heading.intro[0]}
          <br />
          <Accent>{text.heading.intro[1]}</Accent>
        </div>
      </div>
      <div data-safe="hook-code" style={{ position: 'absolute', left: p ? 80 : 110, top: p ? 652 : 571 }}><CodeWindow title="class" width={p ? 820 : 840} fontSize={p ? 32 : 34}><Tokens active={Math.floor(frame / 24) % 3} /></CodeWindow></div>
      <div style={{ position: 'absolute', left: p ? 80 : 1053, top: p ? 876 : 325, transform: `perspective(1400px) rotateY(${p ? 0 : -7}deg) translateY(${Math.sin(frame / 45) * 4}px)` }}><LiveCard locale={locale} width={p ? 820 : 660} /></div>
      {!p && (
        <div style={{ position: 'absolute', left: 1610, top: 590, width: 170, height: 242, border: '1px solid #72C9E0', borderRadius: 27, background: '#081D2A', padding: 15, boxShadow: '0 22px 70px #00000080' }}>
          <div style={{ width: 45, height: 5, borderRadius: 4, background: '#477385', margin: '0 auto 20px' }} />
          <Img src={staticFile('brand/logo.svg')} style={{ width: 105, margin: 14 }} />
          <div className="mono" style={{ textAlign: 'center', fontSize: 17, color: C.ice }}>class → UI</div>
        </div>
      )}
      <div data-safe="hook-targets" style={{ position: 'absolute', top: p ? 1340 : 840, left: p ? 80 : 110, color: C.ice, fontSize: p ? 26 : 27 }}>{text.hookTargets}</div>
      {cover && <div className="mono" style={{ position: 'absolute', left: p ? 80 : 110, top: p ? 1480 : 930, color: '#82AECA', fontSize: 25 }}>tw.weapp.dev ↗</div>}
    </>
  )
}
export function CtaScene({ portrait: p, locale }: { frame: number, portrait: boolean, locale: Locale }) {
  const text = copy[locale]
  return (
    <>
      <div style={{ position: 'absolute', left: p ? 140 : 1050, top: p ? 730 : 80, opacity: 0.3 }}><Ribbon size={p ? 800 : 830} phase={3} /></div>
      <div data-safe="cta" style={{ position: 'absolute', left: p ? 80 : 113, top: p ? 345 : 247, width: p ? 820 : 1030 }}>
        <div style={{ fontSize: p ? 66 : 83, fontWeight: 800, lineHeight: 1.22, letterSpacing: -3 }}>
          {text.heading.cta[0]}
          <br />
          <Accent>{text.heading.cta[1]}</Accent>
        </div>
        <div style={{ marginTop: 42 }}><Brand size={p ? 59 : 68} /></div>
        <div className="mono" style={{ marginTop: 32, fontSize: p ? 58 : 70, color: C.ice }}>
          tw.weapp.dev
          <span style={{ color: C.green }}>↗</span>
        </div>
        <div style={{ marginTop: 20, color: C.muted, fontSize: p ? 29 : 28 }}>{text.ctaLabel}</div>
      </div>
      <div data-safe="qr" style={{ position: 'absolute', left: p ? 80 : 1340, top: p ? 950 : 320 }}>
        <div style={{ width: p ? 288 : 320, background: 'white', padding: 15, borderRadius: 23 }}><Img src={staticFile('brand/docs-qr.png')} style={{ width: '100%', display: 'block' }} /></div>
        <div style={{ marginTop: 22, color: C.ice, fontSize: p ? 27 : 25 }}>{text.ctaScan}</div>
        <div className="mono" style={{ marginTop: 12, color: C.muted, fontSize: 18 }}>OPEN SOURCE / MIT</div>
      </div>
    </>
  )
}
