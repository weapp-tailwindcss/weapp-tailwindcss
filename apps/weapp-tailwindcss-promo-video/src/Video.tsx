import type { Cue } from '../scripts/audio/subtitles'
import type { Format, Locale, SceneId } from './config'
import { useEffect, useState } from 'react'
import { AbsoluteFill, Audio, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame } from 'remotion'
import { Stage } from './components/Stage'
import { films, FPS, SAFE, sceneAtFrame } from './config'
import subtitles from './generated/subtitles.json'
import { Craft } from './scenes/Craft'
import { Ecosystem } from './scenes/Ecosystem'
import { CtaScene, Opening } from './scenes/Opening'
import { Pipeline } from './scenes/Pipeline'
import { Platforms } from './scenes/Platforms'
import { Setup } from './scenes/Setup'
import { Tools } from './scenes/Tools'

export function useFonts() {
  const [handle] = useState(() => delayRender('等待本地品牌字体'))
  useEffect(() => {
    Promise.all([document.fonts.load('700 80px "Noto Sans SC Variable"'), document.fonts.load('500 30px "JetBrains Mono Variable"')]).then(() => document.fonts.ready).then(() => continueRender(handle)).catch(cancelRender)
  }, [handle])
}
function Scene({ id, frame, portrait, locale }: { id: SceneId, frame: number, portrait: boolean, locale: Locale }) {
  const props = { frame, portrait, locale }
  if (id === 'intro') {
    return <Opening {...props} />
  }
  if (id === 'craft') {
    return <Craft {...props} />
  }
  if (id === 'pipeline') {
    return <Pipeline {...props} />
  }
  if (id === 'platforms') {
    return <Platforms {...props} />
  }
  if (id === 'ecosystem') {
    return <Ecosystem {...props} />
  }
  if (id === 'setup') {
    return <Setup {...props} />
  }
  if (id === 'tools') {
    return <Tools {...props} />
  }
  return <CtaScene {...props} />
}
export function PromoVideo({ format, locale = 'zh', muted = false }: { format: Format, locale?: Locale, muted?: boolean }) {
  useFonts()
  const frame = useCurrentFrame()
  const portrait = format === 'portrait'
  const film = films[format]
  const cues = (subtitles as Partial<Record<Locale, Partial<Record<Format, Cue[]>>>>)[locale]?.[format] ?? []
  const caption = cues.find(cue => frame / FPS >= cue.start && frame / FPS < cue.end)
  const safe = SAFE[format]
  return (
    <Stage portrait={portrait} locale={locale} scene={sceneAtFrame(format, frame)?.id}>
      {!muted && <Audio src={staticFile(`audio/${locale}/${format}/master.wav`)} />}
      {film.scenes.map((scene, index) => {
        const relative = frame - scene.from * FPS
        const tail = (scene.from + scene.duration) * FPS - frame
        if (relative < 0 || tail <= 0) {
          return null
        }
        const fade = index === 0 || scene.id === 'cta' ? 1 : Math.min(1, (relative + 4) / 8)
        return <AbsoluteFill key={scene.id} style={{ opacity: fade * (index === film.scenes.length - 1 ? 1 : Math.min(1, tail / 5)) }}><Scene id={scene.id} frame={relative} portrait={portrait} locale={locale} /></AbsoluteFill>
      })}
      {caption && <div data-safe="caption" style={{ position: 'absolute', left: safe.left, right: safe.right, top: safe.captionTop, display: 'flex', justifyContent: 'center' }}><div style={{ whiteSpace: 'pre', textAlign: 'center', fontSize: portrait ? 36 : 30, lineHeight: 1.45, fontWeight: 500, color: '#F0F7FF', background: '#020A14EE', padding: '10px 19px', borderRadius: 10 }}>{caption.text}</div></div>}
    </Stage>
  )
}
export function PromoCover({ format, locale = 'zh' }: { format: Format, locale?: Locale }) {
  useFonts()
  return <Stage portrait={format === 'portrait'} locale={locale} cover><Opening frame={45} portrait={format === 'portrait'} locale={locale} cover /></Stage>
}
