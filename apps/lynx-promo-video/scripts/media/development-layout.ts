import type { DevelopmentShot } from '../capture/development'
import { DEVELOPMENT_LAYOUT as layout } from '../capture/development'

/** 按实际画布预算检查并排面板，禁止 flex 缩小或 overflow 裁掉关键内容。 */
export function verifyDevelopmentShotLayout(shot: DevelopmentShot) {
  const innerWidth = layout.width - layout.border * 2
  const innerHeight = layout.height - layout.border * 2
  if (shot.kind === 'comparison') {
    const width = shot.before.outputWidth + shot.after.outputWidth + layout.comparisonGap
    const height = Math.max(...[shot.before, shot.after].map(image => image.crop.height * image.outputWidth / image.crop.width))
    if (width > innerWidth - layout.comparisonPaddingX * 2
      || height > innerHeight - layout.comparisonPaddingY * 2 - layout.comparisonHeadingHeight - layout.comparisonHeadingGap - layout.comparisonCaptionHeight - layout.comparisonCaptionGap) {
      throw new Error(`${shot.id} 对比截图超出展示画布预算。`)
    }
    return
  }
  const native = shot.view === 'before' || shot.view === 'result'
  const width = shot.outputWidth + (shot.preview ? shot.preview.outputWidth + layout.videoGap : 0)
  const maximumHeight = innerHeight - layout.videoPaddingY * 2 - layout.headerHeight - layout.headerGap
    - (native ? layout.nativeCaptionHeight + layout.nativeCaptionGap : 0)
  const height = Math.max(shot.crop.height * shot.outputWidth / shot.crop.width,
    shot.preview ? shot.preview.crop.height * shot.preview.outputWidth / shot.preview.crop.width + layout.previewHeadingHeight + layout.previewHeadingGap : 0)
  if (width > innerWidth - layout.videoPaddingX * 2 || height > maximumHeight) {
    throw new Error(`${shot.id} 视频与原生预览超出展示画布预算。`)
  }
}
