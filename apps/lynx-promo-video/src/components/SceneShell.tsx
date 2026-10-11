import type { CSSProperties, ReactNode } from 'react'
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion'
import { COLORS } from '../config'

export function SceneShell({ children, style }: { children: ReactNode, style?: CSSProperties }) {
  const frame = useCurrentFrame()
  const opacity = interpolate(frame, [0, 10], [0.72, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })
  const translateY = interpolate(frame, [0, 16], [24, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })

  return (
    <AbsoluteFill
      style={{
        padding: '88px 112px 128px',
        backgroundColor: COLORS.background,
        color: COLORS.text,
        opacity,
        transform: `translateY(${translateY}px)`,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  )
}

export const eyebrowStyle: CSSProperties = {
  color: COLORS.green,
  fontFamily: 'JetBrains Mono Variable, monospace',
  fontSize: 22,
  fontWeight: 650,
  letterSpacing: 0,
}

export const titleStyle: CSSProperties = {
  margin: 0,
  maxWidth: 1060,
  fontSize: 76,
  lineHeight: 1.12,
  fontWeight: 720,
  letterSpacing: 0,
}
