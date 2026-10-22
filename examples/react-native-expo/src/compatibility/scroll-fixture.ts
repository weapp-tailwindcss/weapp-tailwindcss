import type { NativeRect } from './protocol'

/** 只验证 ScrollView.style 的尺寸及程序化 scrollTo，不声明触摸或滚动 utility 支持。 */
export const nativeScrollFixture = {
  version: 1,
  display: { width: 44, height: 44 },
  control: { width: 80, height: 40 },
  stripeHeight: 48,
  contentHeight: 144,
  contentHeightComparison: { native: 'float32-viewport-envelope', web: 'exact', physicalPixels: 'equal', outerScroll: 'disabled-in-report-mode' },
  offsets: [0, 48, 0],
  phases: ['scroll-initial', 'scroll-offset', 'scroll-restored'],
  colors: ['#dc2626', '#2563eb', '#16a34a'],
} as const

export type NativeScrollSide = 'probe' | 'reference' | 'control'
export type NativeScrollPhase = typeof nativeScrollFixture.phases[number]
export interface NativeScrollEvent {
  sequence: number
  contentOffset: { x: number, y: number }
  contentSize: { width: number, height: number }
  layoutMeasurement: { width: number, height: number }
}
export interface NativeScrollCommand {
  sequence: number
  x: number
  y: number
  animated: false
  afterEventSequence: number
}
export interface NativeScrollObservation {
  side: NativeScrollSide
  mountId: string
  layout: { width: number, height: number }
  contentSize: { width: number, height: number }
  firstStripe: NativeRect
  history: Array<{ command: NativeScrollCommand, event: NativeScrollEvent }>
  command?: NativeScrollCommand
  event?: NativeScrollEvent
}
export interface NativeScrollEvidence {
  version: 1
  revision: string
  id: string
  phase: NativeScrollPhase
  stepIndex: number
  sides: NativeScrollObservation[]
}
