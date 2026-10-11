import type { CSSProperties, ReactNode } from 'react'
import { COLORS } from '../config'

export function CodeWindow({ title, children, style }: { title: string, children: ReactNode, style?: CSSProperties }) {
  return (
    <div
      style={{
        overflow: 'hidden',
        border: `1px solid ${COLORS.border}`,
        borderRadius: 8,
        background: '#101516',
        boxShadow: '0 28px 70px rgba(0, 0, 0, 0.34)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', height: 54, padding: '0 22px', borderBottom: `1px solid ${COLORS.border}`, color: COLORS.muted, fontFamily: 'JetBrains Mono Variable, monospace', fontSize: 17 }}>
        {title}
      </div>
      <div className="mono" style={{ minHeight: 280, padding: '26px 28px', fontSize: 21, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
        {children}
      </div>
    </div>
  )
}

export function CodeLine({ children, active = false, indent = 0 }: { children: ReactNode, active?: boolean, indent?: number }) {
  return (
    <div
      style={{
        marginLeft: indent * 24,
        padding: '1px 8px',
        borderLeft: active ? `3px solid ${COLORS.green}` : '3px solid transparent',
        background: active ? 'rgba(7, 193, 96, 0.08)' : 'transparent',
        color: active ? '#f3faf6' : '#b8c5c8',
      }}
    >
      {children}
    </div>
  )
}

export const keyword = { color: '#70d7f5' }
export const stringValue = { color: '#86d8aa' }
export const functionName = { color: '#f0c674' }
