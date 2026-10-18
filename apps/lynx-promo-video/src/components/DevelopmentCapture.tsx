import { OffthreadVideo, Sequence, staticFile } from 'remotion'
import { COLORS, VIDEO } from '../config'
import development from '../generated/development.json'

export function DevelopmentCapture({ sceneId }: { sceneId: 'config' | 'classname' }) {
  let from = 0
  return (
    <div style={{ position: 'relative', height: 780, overflow: 'hidden', border: `1px solid ${COLORS.border}`, borderRadius: 12, background: '#0d1112', boxShadow: '0 24px 80px #0006' }}>
      {development.clips.filter(clip => clip.sceneId === sceneId).map((clip) => {
        const rate = 'playbackRate' in clip ? Number(clip.playbackRate) : 1
        const duration = Math.round((clip.endSeconds - clip.startSeconds) / rate * VIDEO.fps)
        const start = from
        from += duration
        return (
          <Sequence key={`${clip.eventId}-${start}`} from={start} durationInFrames={duration} layout="none">
            <OffthreadVideo
              src={staticFile('captures/development.mp4')}
              startFrom={Math.round(clip.startSeconds * VIDEO.fps)}
              playbackRate={rate}
              muted
              style={{ display: 'block', width: '100%', height: 780, objectFit: 'contain' }}
            />
          </Sequence>
        )
      })}
    </div>
  )
}
