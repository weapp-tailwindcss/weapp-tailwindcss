import type { Locale } from '../config'
import { Browser, Phone } from '../components/Interface'
import { Heading } from '../components/Stage'
import { C } from '../config'
import { copy } from '../content/copy'

export function Platforms({ frame, portrait: p, locale }: { frame: number, portrait: boolean, locale: Locale }) {
  const text = copy[locale]
  const active = Math.min(5, Math.floor(frame / (p ? 45 : 60)))
  const native = active >= 3
  return (
    <>
      <Heading locale={locale} scene="platforms" portrait={p} horizontal />
      <div data-safe="platform-list" style={{ position: 'absolute', left: p ? 80 : 110, top: p ? 580 : 376, width: p ? 820 : 780 }}>
        {text.targetLabels.map((label, i) => (
          <div key={label} style={{ height: p ? 120 : 81, display: 'flex', alignItems: 'center', borderBottom: '1px solid #38617A55', padding: p ? '8px 17px' : '8px 18px', background: active === i ? 'linear-gradient(90deg,#0EA5E927,#07C16015)' : 'transparent', borderLeft: `3px solid ${active === i ? C.green : 'transparent'}` }}>
            <div style={{ width: p ? 32 : 29, color: active === i ? '#78F0BB' : '#416E84', fontSize: 22 }}>{active === i ? '↗' : '·'}</div>
            <div>
              <div style={{ color: active === i ? C.text : '#8CABBF', fontSize: p ? 42 : 28, lineHeight: 1.2, fontWeight: active === i ? 700 : 450 }}>{label}</div>
              <div className="mono" style={{ fontSize: p ? 28 : 16, lineHeight: 1.25, color: active === i ? C.ice : '#567F96', marginTop: 4 }}>{text.targetDetails[i]}</div>
            </div>
          </div>
        ))}
      </div>
      {!p && (
        <>
          <div style={{ position: 'absolute', left: 1010, top: 400, opacity: native ? 0.4 : 1, transform: `translateX(${native ? -15 : 0}px)` }}><Browser width={670} locale={locale} /></div>
          <div style={{ position: 'absolute', left: native ? 1275 : 1490, top: native ? 363 : 483, transform: `rotate(${native ? -3 : 5}deg)` }}><Phone width={native ? 264 : 202} locale={locale} color={native ? 'green' : 'blue'} /></div>
          <div style={{ position: 'absolute', left: 1020, top: 316, fontSize: 25, color: C.ice }}>{text.targetGroup[native ? 1 : 0]}</div>
        </>
      )}
      <div data-safe="support-note" style={{ position: 'absolute', left: p ? 80 : 111, top: p ? 1340 : 892, color: '#7FA4B8', fontSize: p ? 23 : 20 }}>
        {text.supportNote}
        {!p && ` · ${text.design}`}
      </div>
    </>
  )
}
