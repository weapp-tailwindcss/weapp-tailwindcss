import { OffthreadVideo, staticFile } from 'remotion'
import { COLORS } from '../config'

export function DeviceCapture({ platform, width = 330, startFrom = 0 }: { platform: 'ios' | 'android', width?: number, startFrom?: number }) {
  return (
    <div style={{ width, padding: 9, border: `1px solid ${COLORS.border}`, borderRadius: 42, background: '#050708', boxShadow: '0 30px 90px rgba(0, 0, 0, 0.42)' }}>
      <div style={{ width: '100%', overflow: 'hidden', borderRadius: 33, background: '#0d1112' }}>
        <OffthreadVideo
          src={staticFile(`captures/${platform}.mp4`)}
          startFrom={startFrom}
          muted
          style={{ display: 'block', width: '100%', height: 'auto' }}
        />
      </div>
    </div>
  )
}
