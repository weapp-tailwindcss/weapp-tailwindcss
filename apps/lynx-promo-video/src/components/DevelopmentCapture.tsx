import type { CSSProperties } from 'react'
import type { CaptureRect, DevelopmentScreenshot, DevelopmentShot, DevelopmentVideoShot } from '../../scripts/capture/development'
import { Img, OffthreadVideo, Sequence, staticFile } from 'remotion'
import { COLORS, VIDEO } from '../config'
import development from '../generated/development.json'

const panel: CSSProperties = { position: 'relative', overflow: 'hidden', background: '#0d1112', borderRadius: 8, flexShrink: 0 }

function cropStyle(crop: CaptureRect, width: number, sourceWidth: number, sourceHeight: number): CSSProperties {
  const scale = width / crop.width
  return { position: 'absolute', maxWidth: 'none', width: sourceWidth * scale, height: sourceHeight * scale, left: -crop.x * scale, top: -crop.y * scale }
}

function Screenshot({ source }: { source: DevelopmentScreenshot }) {
  return (
    <div style={{ ...panel, width: source.outputWidth, height: source.crop.height * source.outputWidth / source.crop.width }}>
      <Img src={staticFile(source.media.path)} style={cropStyle(source.crop, source.outputWidth, source.media.width, source.media.height)} />
    </div>
  )
}

function VideoCrop({ shot }: { shot: DevelopmentVideoShot }) {
  return (
    <div style={{ ...panel, width: shot.outputWidth, height: shot.crop.height * shot.outputWidth / shot.crop.width }}>
      <OffthreadVideo src={staticFile(shot.media.path)} startFrom={Math.round(shot.startSeconds * VIDEO.fps)} endAt={Math.round(shot.endSeconds * VIDEO.fps)} muted style={cropStyle(shot.crop, shot.outputWidth, shot.media.width, shot.media.height)} />
    </div>
  )
}

function Shot({ shot, english }: { shot: DevelopmentShot, english: boolean }) {
  const change = shot.round === 2 ? (english ? 'BLUE → GREEN' : '蓝 → 绿') : (english ? 'PADDING 8 → 24px · CARD & PHOTO RADIUS 4 → 28px' : '内边距 8 → 24px · 卡片与头像圆角 4 → 28px')
  if (shot.kind === 'comparison') {
    return (
      <div style={{ padding: '30px 50px' }}>
        <div style={{ display: 'flex', gap: 32, justifyContent: 'center', alignItems: 'flex-start' }}>
          {[shot.before, shot.after].map((source, index) => (
            <div key={source.stage}>
              <div style={{ fontSize: 28, lineHeight: '36px', fontWeight: 650, color: index ? COLORS.green : COLORS.muted, marginBottom: 22 }}>{index ? (english ? 'AFTER' : '修改后') : (english ? 'BEFORE' : '修改前')}</div>
              <Screenshot source={source} />
            </div>
          ))}
        </div>
        <div className="mono" style={{ textAlign: 'center', marginTop: 42, fontSize: 30, lineHeight: '42px', color: COLORS.text }}>{change}</div>
      </div>
    )
  }
  const native = shot.view === 'before' || shot.view === 'result'
  const label = shot.view === 'editor'
    ? (english ? 'EDIT · BuildStatus.tsx' : '编辑 · BuildStatus.tsx')
    : shot.view === 'terminal'
      ? (english ? 'SAVE → BUILD → RELOAD' : '保存 → 构建 → 重新加载')
      : shot.view === 'config' ? 'lynx.config.ts · Rspeedy' : shot.view === 'before' ? (english ? 'BEFORE · NATIVE' : '修改前 · 原生画面') : (english ? 'AFTER · NATIVE UPDATE' : '修改后 · 原生更新')
  return (
    <div style={{ padding: '24px 36px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
        <div className="mono" style={{ fontSize: 24, lineHeight: '32px', color: COLORS.green }}>{label}</div>
        {shot.waitTrimmed && <div style={{ fontSize: 23, color: '#f3d58a' }}>{english ? 'Build waiting time removed' : '已剪去构建等待'}</div>}
      </div>
      <div style={{ display: 'flex', gap: 28, justifyContent: 'center', alignItems: 'flex-start' }}>
        <VideoCrop shot={shot} />
        {shot.preview && (
          <div>
            <div style={{ fontSize: 22, lineHeight: '28px', color: COLORS.muted, marginBottom: 16 }}>{english ? 'Native preview · before' : '原生预览 · 修改前'}</div>
            <Screenshot source={shot.preview} />
          </div>
        )}
      </div>
      {native && <div className="mono" style={{ marginTop: 30, textAlign: 'center', fontSize: 31, lineHeight: '42px', color: COLORS.text }}>{change}</div>}
    </div>
  )
}

export function DevelopmentCapture({ sceneId, locale }: { sceneId: 'config' | 'classname', locale: 'zh' | 'en' }) {
  const shots = (development as unknown as { shots?: DevelopmentShot[] }).shots
  let from = 0
  return (
    <div style={{ position: 'relative', height: 780, overflow: 'hidden', border: `1px solid ${COLORS.border}`, borderRadius: 12, background: '#0d1112' }}>
      {shots?.filter(shot => shot.sceneId === sceneId).map((shot) => {
        const start = from
        from += shot.displayFrames
        return <Sequence key={shot.id} from={start} durationInFrames={shot.displayFrames} layout="none"><Shot shot={shot} english={locale === 'en'} /></Sequence>
      })}
    </div>
  )
}
