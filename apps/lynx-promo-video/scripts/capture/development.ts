import type { FileDigest } from './manifest'

export type DevelopmentStage = 'initial' | 'spacing' | 'color'
export type DevelopmentView = 'config' | 'before' | 'editor' | 'terminal' | 'result'

export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
}

export interface DevelopmentImageSource extends FileDigest {
  width: number
  height: number
}

export interface DevelopmentVideoSource extends DevelopmentImageSource {
  durationSeconds: number
}

export interface DevelopmentVideoShot {
  kind: 'video'
  id: string
  sceneId: 'config' | 'classname'
  round?: 1 | 2
  view: DevelopmentView
  stage: DevelopmentStage
  eventId: string
  media: DevelopmentVideoSource
  crop: CaptureRect
  outputWidth: number
  cardRect?: CaptureRect
  sourceCodeFontSize?: number
  startSeconds: number
  endSeconds: number
  displayFrames: number
  playbackRate?: 1
  waitTrimmed?: boolean
  preview?: DevelopmentScreenshot
}

export interface DevelopmentScreenshot {
  stage: DevelopmentStage
  eventId: string
  media: DevelopmentImageSource
  sourceVideo: DevelopmentVideoSource
  sourceSeconds: number
  crop: CaptureRect
  cardRect: CaptureRect
  outputWidth: number
}

export interface DevelopmentComparisonShot {
  kind: 'comparison'
  id: string
  sceneId: 'classname'
  round: 1 | 2
  displayFrames: number
  before: DevelopmentScreenshot
  after: DevelopmentScreenshot
}

export type DevelopmentShot = DevelopmentVideoShot | DevelopmentComparisonShot
