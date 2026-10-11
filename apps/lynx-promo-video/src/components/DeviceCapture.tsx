import { OffthreadVideo, staticFile } from 'remotion'
import { COLORS } from '../config'

export function DeviceCapture({ platform, width = 330, startFrom = 0 }: { platform: 'ios' | 'android', width?: number, startFrom?: number }) {
  const height = width * 2.02
  return (
    <div style={{ width, height, padding: 9, border: `1px solid ${COLORS.border}`, borderRadius: 42, background: '#050708', boxShadow: '0 30px 90px rgba(0, 0, 0, 0.42)' }}>
      <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', borderRadius: 33, background: '#0d1112' }}>
        <OffthreadVideo
          src={staticFile(`captures/${platform}.mp4`)}
          startFrom={startFrom}
          muted
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{ position: 'absolute', left: '50%', top: 10, width: 86, height: 22, transform: 'translateX(-50%)', borderRadius: 12, background: '#050708' }} />
      </div>
    </div>
  )
}
