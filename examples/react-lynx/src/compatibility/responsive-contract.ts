import type { NativeArtifactReceipt, NativeRect } from './types'

/** 根 viewport、独立 rem 标尺和完整像素序列共同证明媒体条件及恢复。 */
export const responsiveContract = {
  version: 1,
  id: 'variant-responsive',
  checkpoint: 'viewport:responsive-v1',
  condition: '(width < 48rem)',
  phases: ['narrow', 'wide', 'narrowed', 'restored'],
  thresholdRem: 48,
  narrowRatio: 0.5,
  wideRatio: 1.25,
  canvas: { width: 240, height: 80 },
  panel: { left: 16, top: 16, width: 80, height: 40, matchedWidth: 200 },
} as const

export type ResponsivePhase = typeof responsiveContract.phases[number]
export interface ResponsiveFrame {
  runId: string
  requestId: string
  phase: ResponsivePhase
  original: { width: number, height: number }
  requested: { width: number, height: number }
  viewport: { width: number, height: number, measuredWidth: number, measuredHeight: number, pixelRatio: number }
  threshold: NativeRect
  geometry: Record<'probe' | 'control' | 'probeContainer' | 'controlContainer', NativeRect>
}

export interface ResponsiveCapture {
  frame: ResponsiveFrame
  artifacts: NativeArtifactReceipt[]
}

export function responsiveArtifactNames(phase: ResponsivePhase) {
  return [`variant-responsive-${phase}-probe.png`, `variant-responsive-${phase}-control.png`, `variant-responsive-${phase}.native.json`]
}

export function validResponsiveFrame(frame: ResponsiveFrame | undefined, runId: string, phase: ResponsivePhase, requestId?: string): frame is ResponsiveFrame {
  const sizes = [frame?.original?.width, frame?.original?.height, frame?.requested?.width, frame?.requested?.height, frame?.viewport?.width, frame?.viewport?.height, frame?.viewport?.measuredWidth, frame?.viewport?.measuredHeight, frame?.viewport?.pixelRatio]
  const rects = frame?.geometry && [frame.threshold, ...Object.values(frame.geometry)]
  return Boolean(frame && frame.runId === runId && frame.phase === phase && /^responsive-[1-9]\d*$/.test(frame.requestId)
    && (!requestId || frame.requestId === requestId) && sizes.every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)
    && frame.geometry && Object.keys(frame.geometry).sort().join(',') === 'control,controlContainer,probe,probeContainer'
    && rects?.every(rect => rect && ['left', 'top', 'right', 'bottom', 'width', 'height'].every(key => Number.isFinite(rect[key as keyof NativeRect]))
      && rect.width > 0 && rect.height > 0 && Math.abs(rect.right - rect.left - rect.width) < 0.01 && Math.abs(rect.bottom - rect.top - rect.height) < 0.01))
}
