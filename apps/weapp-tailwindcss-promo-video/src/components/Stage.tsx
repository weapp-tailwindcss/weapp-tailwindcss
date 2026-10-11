import type { ReactNode } from 'react'
import type { Locale, SceneId } from '../config'
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from 'remotion'
import { C } from '../config'
import { copy } from '../content/copy'
import { Ribbon } from './Ribbon'

export function Brand({ size = 44, label = true }: { size?: number, label?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
      <Img src={staticFile('brand/logo.svg')} style={{ width: size, height: size }} />
      {label && <span className="mono" style={{ fontSize: size * 0.54, fontWeight: 650, color: C.text, letterSpacing: -0.8 }}>weapp-tailwindcss</span>}
    </div>
  )
}
export function Stage({ children, portrait, locale, scene = 'intro', cover = false }: { children: ReactNode, portrait: boolean, locale: Locale, scene?: SceneId, cover?: boolean }) {
  const frame = useCurrentFrame()
  const { durationInFrames } = useVideoConfig()
  return (
    <AbsoluteFill style={{ background: C.background, color: C.text, overflow: 'hidden', fontFamily: 'Noto Sans SC Variable' }}>
      <AbsoluteFill style={{ background: 'radial-gradient(ellipse at 80% 45%,#0B344B90,transparent 62%),linear-gradient(145deg,#0A192C,#030B14 75%)' }} />
      <AbsoluteFill style={{ backgroundImage: 'radial-gradient(#739AB344 0.7px,transparent 0.7px)', backgroundSize: '32px 32px', opacity: 0.23 }} />
      <div style={{ position: 'absolute', left: portrait ? 400 : 1130, top: portrait ? 550 : 150, opacity: 0.12 }}><Ribbon size={portrait ? 850 : 800} /></div>
      <div style={{ position: 'absolute', left: portrait ? 80 : 104, top: portrait ? 190 : 55 }}><Brand size={portrait ? 46 : 42} /></div>
      <div style={{ position: 'absolute', left: portrait ? 80 : 104, right: portrait ? 180 : 104, top: portrait ? 264 : 121, height: 1, background: '#7EB5CF33' }} />
      {!portrait && (
        <div style={{ position: 'absolute', right: 106, top: 62, fontSize: 20, color: C.ice }}>
          {copy[locale].chapter[scene]}
          {' '}
          <span className="mono" style={{ marginLeft: 24, color: '#57798D' }}>{locale.toUpperCase()}</span>
        </div>
      )}
      {children}
      {!cover && <div style={{ position: 'absolute', left: portrait ? 80 : 104, right: portrait ? 180 : 104, bottom: portrait ? 300 : 40, height: 2, background: '#41657855' }}><div style={{ width: `${frame / (durationInFrames - 1) * 100}%`, height: 2, background: `linear-gradient(90deg,${C.green},${C.blue})` }} /></div>}
    </AbsoluteFill>
  )
}
export function Accent({ children }: { children: ReactNode }) {
  return <span style={{ background: 'linear-gradient(105deg,#D3F4FF,#8BE0F6 50%,#55E5B2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{children}</span>
}
export function Heading({ locale, scene, portrait, horizontal = false }: { locale: Locale, scene: SceneId, portrait: boolean, horizontal?: boolean }) {
  const text = copy[locale]
  return (
    <div data-safe="heading" style={{ position: 'absolute', left: portrait ? 80 : 104, right: portrait ? 180 : 104, top: portrait ? 310 : 166 }}>
      <div style={{ fontSize: portrait ? 24 : 19, letterSpacing: 2, color: C.ice, marginBottom: 19 }}>{text.chapter[scene]}</div>
      <div style={{ fontSize: portrait ? 72 : 76, lineHeight: 1.18, letterSpacing: locale === 'zh' ? -2 : -3, fontWeight: 780 }}>
        {text.heading[scene][0]}
        {portrait || !horizontal ? <br /> : ' '}
        <Accent>{text.heading[scene][1]}</Accent>
      </div>
    </div>
  )
}
