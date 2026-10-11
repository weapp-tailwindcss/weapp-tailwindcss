import type { PromoCopy } from '../config'
import { interpolate, useCurrentFrame } from 'remotion'
import { CodeLine, CodeWindow, stringValue } from '../components/CodeWindow'
import { DeviceCapture } from '../components/DeviceCapture'
import { eyebrowStyle, SceneShell } from '../components/SceneShell'
import { typedText, TypingCursor } from '../components/Typing'
import { COLORS } from '../config'

const classSteps = [
  'flex flex-row items-center',
  'flex flex-row items-center rounded-[18px] p-4',
  'flex flex-row items-center rounded-[18px] bg-[#10241b] p-4',
] as const

export function ClassNameScene({ copy }: { copy: PromoCopy['classname'] }) {
  const frame = useCurrentFrame()
  const step = Math.min(2, Math.floor(frame / 88))
  const typedClassName = typedText(classSteps[step], frame, step * 88 + 12, 34)
  const deviceOpacity = interpolate(frame, [22, 52], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  return (
    <SceneShell style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.75fr', gap: 78, alignItems: 'center' }}>
      <div>
        <div style={eyebrowStyle}>{copy.eyebrow}</div>
        <h2 style={{ margin: '20px 0 44px', fontSize: 66, lineHeight: 1.14, fontWeight: 720, letterSpacing: 0 }}>{copy.title}</h2>
        <CodeWindow title="BuildStatus.tsx">
          <CodeLine>{'<view'}</CodeLine>
          <CodeLine active indent={1}>
            className=
            <span style={stringValue}>{`"${typedClassName}`}</span>
            <TypingCursor frame={frame} />
            {typedClassName.length === classSteps[step].length ? <span style={stringValue}>"</span> : null}
          </CodeLine>
          <CodeLine indent={1}>{'>'}</CodeLine>
          <CodeLine indent={1}>{'<text className="text-[#75dfa6]">Bundle ready</text>'}</CodeLine>
          <CodeLine>{'</view>'}</CodeLine>
        </CodeWindow>
        <div style={{ display: 'flex', gap: 28, marginTop: 30, color: COLORS.muted, fontSize: 20 }}>
          <span>{copy.runtimeNote}</span>
          <span>{copy.jsxNote}</span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', opacity: deviceOpacity }}>
        <DeviceCapture platform="ios" width={350} startFrom={60} />
      </div>
    </SceneShell>
  )
}
