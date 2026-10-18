import type { DevelopmentEvent, DevelopmentScreenshot, DevelopmentShot, DevelopmentStage, DevelopmentVideoShot } from '../../scripts/capture/manifest'

export const developmentScenes = [{ id: 'config', duration: 240 }, { id: 'classname', duration: 900 }]

export function developmentFixture() {
  const events: DevelopmentEvent[] = (['initial', 'spacing', 'color'] as const).map((id, index) => ({
    id, startSeconds: 0, endSeconds: 100, sourceSha256: String(index + 1).repeat(64), bundleSha256: String(index + 4).repeat(64),
  }))
  const desktop = { path: 'development.mp4', sha256: 'a'.repeat(64), width: 3840, height: 2160, durationSeconds: 100 }
  const native = { path: 'native.mp4', sha256: 'b'.repeat(64), width: 1200, height: 2400, durationSeconds: 20 }
  const crop = { x: 20, y: 100, width: 900, height: 600 }
  const cardRect = { x: 60, y: 140, width: 820, height: 250 }
  const screenshot = (stage: DevelopmentStage, sourceSeconds: number): DevelopmentScreenshot => ({
    stage, eventId: stage, media: { path: `${stage}.png`, sha256: ({ initial: 'c', spacing: 'd', color: 'e' }[stage]).repeat(64), width: native.width, height: native.height },
    sourceVideo: { ...native }, sourceSeconds, crop: { ...crop }, cardRect: { ...cardRect }, outputWidth: 780,
  })
  const images = { initial: screenshot('initial', 0.5), spacing: screenshot('spacing', 3), color: screenshot('color', 10) }
  const video = (id: string, view: DevelopmentVideoShot['view'], stage: DevelopmentStage, startSeconds: number, endSeconds: number, round?: 1 | 2): DevelopmentVideoShot => {
    const isNative = view === 'before' || view === 'result'
    return {
      kind: 'video', id, sceneId: round ? 'classname' : 'config', round, view, stage, eventId: stage,
      media: { ...(isNative ? native : desktop) }, crop: isNative ? { ...crop } : { x: 0, y: 0, width: 1200, height: 1200 },
      outputWidth: isNative ? 900 : 1200, cardRect: isNative ? { ...cardRect } : undefined,
      sourceCodeFontSize: isNative ? undefined : 36, startSeconds, endSeconds, displayFrames: (endSeconds - startSeconds) * 30,
      preview: view === 'editor' ? structuredClone(images[round === 1 ? 'initial' : 'spacing']) : undefined,
    }
  }
  const shots: DevelopmentShot[] = [video('config', 'config', 'initial', 0, 8)]
  for (const round of [1, 2] as const) {
    const stage = round === 1 ? 'spacing' : 'color'
    const before = round === 1 ? 'initial' : 'spacing'
    const desktopStart = round === 1 ? 10 : 40
    const nativeStart = round === 1 ? 0 : 7
    shots.push(
      video(`${round}-before`, 'before', before, nativeStart, nativeStart + 1, round),
      video(`${round}-editor`, 'editor', stage, desktopStart, desktopStart + 4, round),
      video(`${round}-command`, 'terminal', stage, desktopStart + 4, desktopStart + 5, round),
      { ...video(`${round}-success`, 'terminal', stage, desktopStart + 20, desktopStart + 21, round), waitTrimmed: true },
      video(`${round}-reload`, 'terminal', stage, desktopStart + 21, desktopStart + 22, round),
      video(`${round}-result`, 'result', stage, nativeStart + 2, nativeStart + 6, round),
      { kind: 'comparison', id: `${round}-comparison`, sceneId: 'classname', round, displayFrames: 90, before: structuredClone(images[before]), after: structuredClone(images[stage]) },
    )
  }
  return { events, shots, desktop, native, images }
}
