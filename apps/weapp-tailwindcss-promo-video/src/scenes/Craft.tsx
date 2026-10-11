import type { Locale } from '../config'
import { CodeWindow, LiveCard, Tokens } from '../components/Proof'
import { Heading } from '../components/Stage'
import { C } from '../config'
import { copy } from '../content/copy'
import { sceneStep } from '../motion'

export function Craft({ frame, portrait: p, locale }: { frame: number, portrait: boolean, locale: Locale }) {
  const step = sceneStep(frame, locale, p ? 'portrait' : 'landscape', 'craft')
  const text = copy[locale]
  return (
    <>
      <Heading locale={locale} scene="craft" portrait={p} />
      <div data-safe="craft-code" style={{ position: 'absolute', left: p ? 80 : 110, top: p ? 585 : 448 }}>
        <CodeWindow title="component.wxml" width={p ? 820 : 848} fontSize={p ? 31 : 33}>
          <div style={{ color: '#79B7D5' }}>&lt;view class=&quot;</div>
          <Tokens active={step} />
          <div style={{ color: '#79B7D5' }}>&quot;&gt; … &lt;/view&gt;</div>
        </CodeWindow>
      </div>
      <div style={{ position: 'absolute', left: p ? 80 : 1090, top: p ? 921 : 390 }}><LiveCard locale={locale} step={step} width={p ? 820 : 640} /></div>
      <div data-safe="craft-labels" style={{ position: 'absolute', left: p ? 80 : 114, top: p ? 1356 : 853, display: 'flex', gap: p ? 42 : 50, fontSize: p ? 32 : 31 }}>
        {text.craftLabels.map((label, i) => (
          <span key={label} style={{ color: i === step ? '#80F1BA' : C.muted }}>
            {label}
            <span className="mono" style={{ marginLeft: 15, color: i === step ? '#80F1BA' : '#37576B' }}>↗</span>
          </span>
        ))}
      </div>
      {!p && <div style={{ position: 'absolute', left: 1450, top: 867, color: '#6C97AD', fontSize: 20 }}>{text.design}</div>}
    </>
  )
}
