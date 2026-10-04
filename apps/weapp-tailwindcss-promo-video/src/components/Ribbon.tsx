import { useCurrentFrame } from 'remotion'
import { C } from '../config'

function orbit(phase: number, index: number) {
  const points: string[] = []
  const turn = -0.45 + index * 0.32
  for (let i = 0; i <= 180; i++) {
    const a = i / 180 * Math.PI * 2
    const radius = 245 + index * 19 + Math.sin(a * 2 + phase) * 12
    const x = Math.cos(a) * radius
    const y = Math.sin(a) * radius * (0.3 + index * 0.035)
    const px = x * Math.cos(turn) - y * Math.sin(turn)
    const py = x * Math.sin(turn) + y * Math.cos(turn)
    points.push(`${i ? 'L' : 'M'}${(360 + px).toFixed(2)},${(360 + py).toFixed(2)}`)
  }
  return `${points.join(' ')} Z`
}

export function Ribbon({ size = 720, phase = 0, subdued = false }: { size?: number, phase?: number, subdued?: boolean }) {
  const frame = useCurrentFrame()
  const t = frame / 160 + phase
  const id = `ribbon-${String(phase).replace('.', '-')}-${size}`
  return (
    <svg width={size} height={size} viewBox="0 0 720 720" style={{ overflow: 'visible', opacity: subdued ? 0.36 : 1 }}>
      <defs>
        <linearGradient id={id} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor={C.green} />
          <stop offset=".43" stopColor="#44DCD2" />
          <stop offset=".72" stopColor={C.blue} />
          <stop offset="1" stopColor="#BDDFFF" />
        </linearGradient>
        <radialGradient id={`${id}-aura`}>
          <stop stopColor="#0A597E" stopOpacity=".35" />
          <stop offset="1" stopColor="#0A597E" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="360" cy="360" r="340" fill={`url(#${id}-aura)`} />
      {[0, 1, 2, 3, 4, 5].map(i => (
        <g key={i}>
          <path d={orbit(t, i)} stroke={`url(#${id})`} strokeWidth={i === 2 ? 18 : 5} opacity={i === 2 ? 0.06 : 0.1} fill="none" />
          <path d={orbit(t, i)} stroke={`url(#${id})`} strokeWidth={i === 2 ? 3.5 : 1.2} opacity={0.5 + i * 0.075} fill="none" />
          <path d={orbit(t, i)} stroke={i % 2 ? C.ice : '#6EFBB4'} strokeWidth="3" strokeLinecap="round" strokeDasharray="95 1850" strokeDashoffset={-frame * (1.8 + i * 0.26) - i * 210} opacity=".8" fill="none" />
        </g>
      ))}
      {[0, 1, 2, 3].map((i) => {
        const a = t * 0.4 + i * 1.7
        return <circle key={i} cx={360 + Math.cos(a) * 296} cy={360 + Math.sin(a) * 165} r={i % 2 ? 2.5 : 4} fill={i % 2 ? C.ice : C.green} />
      })}
    </svg>
  )
}
