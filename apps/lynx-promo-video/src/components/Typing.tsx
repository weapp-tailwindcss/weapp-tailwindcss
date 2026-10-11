import { interpolate } from 'remotion'
import { COLORS } from '../config'

export function typedText(text: string, frame: number, startFrame: number, duration: number) {
  const progress = interpolate(frame, [startFrame, startFrame + duration], [0, text.length], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  })
  return text.slice(0, Math.floor(progress))
}

export function typingCursor(frame: number) {
  return Math.floor(frame / 8) % 2 === 0
}

export function TypingCursor({ frame }: { frame: number }) {
  return (
    <span aria-hidden style={{ display: 'inline-block', width: 3, height: '1.05em', marginLeft: 3, verticalAlign: '-0.12em', background: COLORS.green, opacity: typingCursor(frame) ? 1 : 0, boxShadow: `0 0 12px ${COLORS.green}` }} />
  )
}
