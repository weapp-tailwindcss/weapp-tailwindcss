import type { LynxPromoProps } from '../config'
import { Audio } from '@remotion/media'
import { AbsoluteFill, Sequence, staticFile } from 'remotion'
import { Subtitles } from '../components/Subtitles'
import { scenes } from '../config'
import { ClassNameScene } from '../scenes/ClassNameScene'
import { ConfigScene } from '../scenes/ConfigScene'
import { CtaScene } from '../scenes/CtaScene'
import { EvidenceScene } from '../scenes/EvidenceScene'
import { HookScene } from '../scenes/HookScene'
import { NativeScene } from '../scenes/NativeScene'
import { PipelineScene } from '../scenes/PipelineScene'

export function LynxPromo(props: LynxPromoProps) {
  const { copy, locale } = props
  return (
    <AbsoluteFill style={{ background: '#0b0f10' }}>
      <Audio src={staticFile('audio/ambient.wav')} volume={0.045} />
      {scenes.map((scene, index) => {
        const narrationFile = staticFile(`audio/narration/${locale}/${String(index + 1).padStart(2, '0')}-${scene.id}.mp3`)
        return (
          <Sequence key={scene.id} from={scene.from} durationInFrames={scene.duration}>
            {scene.id === 'hook' && <HookScene copy={copy.hook} />}
            {scene.id === 'config' && <ConfigScene copy={copy.config} />}
            {scene.id === 'classname' && <ClassNameScene copy={copy.classname} />}
            {scene.id === 'pipeline' && <PipelineScene copy={copy.pipeline} />}
            {scene.id === 'native' && <NativeScene copy={copy.native} />}
            {scene.id === 'evidence' && <EvidenceScene evidence={props.evidence} copy={copy.evidence} />}
            {scene.id === 'cta' && <CtaScene packageName={props.packageName} docsUrl={props.docsUrl} copy={copy.cta} qrAsset={locale === 'en' ? 'brand/docs-qr-en.png' : 'brand/docs-qr.png'} />}
            <Audio src={narrationFile} volume={1} />
          </Sequence>
        )
      })}
      <Subtitles locale={locale} />
    </AbsoluteFill>
  )
}
