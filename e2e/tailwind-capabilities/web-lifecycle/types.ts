import type { Buffer } from 'node:buffer'
import type { WebPixelMeasurement } from '../web/pixels'

export type LifecycleId = 'lifecycle-starting' | 'lifecycle-details-content'
export type LifecycleValues = Record<string, string | number | boolean | null>
export type CaptureLifecycleScreenshot = (name: string) => Promise<Buffer>

export interface LifecycleEvent {
  type: string
  target: string
  trusted: boolean
  time: number
  cycle?: number
  phase?: string
  step?: string
  property?: string
  elapsedTime?: number
  pseudoElement?: string
  key?: string
  oldState?: string
  newState?: string
}

export interface StartingFrame {
  cycle: number
  time: number
  probe: number
  control: number
  phase?: 'insertion' | 'rendered'
}

export interface LifecycleObservation {
  runId: string
  id: LifecycleId
  url: string
  values: LifecycleValues
  events: LifecycleEvent[]
  frames?: StartingFrame[]
  pixels: Record<string, WebPixelMeasurement[]>
  restoration: Record<string, unknown>
}
