import type { Locale } from '../config'
import { CodeWindow } from '../components/Proof'
import { Heading } from '../components/Stage'
import { C } from '../config'
import { copy, setupCode } from '../content/copy'
import { sceneStep } from '../motion'

export function Setup({ frame, portrait: p, locale }: { frame: number, portrait: boolean, locale: Locale }) {
  const text = copy[locale]
  const selected = sceneStep(frame, locale, p ? 'portrait' : 'landscape', 'setup')
  return (
    <>
      <Heading locale={locale} scene="setup" portrait={p} horizontal />
      {p
        ? (
            <div data-safe="setup-mobile" style={{ position: 'absolute', left: 80, top: 605, width: 820 }}>
              {text.setupMobile.map((step, i) => (
                <div key={step} style={{ padding: '31px 24px', marginBottom: 20, border: `1px solid ${i === selected ? '#4CE7AC' : '#345872'}`, background: i === selected ? '#0C3D39' : '#0B2134', borderRadius: 18, display: 'flex', gap: 25, alignItems: 'center' }}>
                  <span className="mono" style={{ color: C.green, fontSize: 38 }}>
                    0
                    {i + 1}
                  </span>
                  <span style={{ fontSize: 39, fontWeight: 600 }}>{step}</span>
                </div>
              ))}
              <div className="mono" style={{ marginTop: 37, color: C.ice, fontSize: 33 }}>
                pnpm add -D tailwindcss weapp-tailwindcss
              </div>
            </div>
          )
        : (
            <>
              <div style={{ position: 'absolute', left: 112, top: 385, width: 480 }}>
                <div style={{ color: C.ice, fontSize: 24, marginBottom: 30 }}>{text.setupTarget}</div>
                {text.setupSteps.map((step, i) => (
                  <div key={step} style={{ padding: '20px 0', marginBottom: 17, color: i === selected ? C.text : '#557F96', display: 'flex', gap: 24, fontSize: 37, borderBottom: `1px solid ${i === selected ? C.green : '#26465A'}` }}>
                    <span className="mono" style={{ color: i === selected ? C.green : '#345C72' }}>
                      0
                      {i + 1}
                    </span>
                    {step}
                  </div>
                ))}
                <div style={{ marginTop: 24, color: C.muted, fontSize: 22, lineHeight: 1.5 }}>{text.setupHint}</div>
              </div>
              <div style={{ position: 'absolute', left: 668, top: 385 }}><CodeWindow title={['terminal', 'app.css / main.ts', 'vite.config.ts'][selected]} width={1130} fontSize={28}>{setupCode[selected].map((line, i) => <div key={`${i}-${line}`} style={{ minHeight: 44, whiteSpace: 'pre', color: line.startsWith('//') ? '#6D91A7' : line.includes('weapp-tailwindcss') ? '#8FE5BA' : '#BDE6F6' }}>{line || ' '}</div>)}</CodeWindow></div>
            </>
          )}
    </>
  )
}
