import type { BrowserEngine } from '../types'
import type { nativeMediaStates } from './fixtures'

export interface MediaParameters {
  media: string
  features: { name: string, value: string }[]
}

export interface MediaCommand {
  method: 'Emulation.setEmulatedMedia'
  params: MediaParameters
  response?: unknown
  error?: string
}

export interface MediaState {
  name: typeof nativeMediaStates[number]
  command: MediaCommand
  id: string
  runId: string
  url: string
  frames: number[]
  queries: Record<string, boolean>
  backgrounds: Record<string, string>
  rects: Record<string, { left: number, top: number, width: number, height: number }>
  screenshot: string
}

export interface MediaObservation {
  states: MediaState[]
  cleanup: { reset?: MediaCommand, detached: boolean, errors: string[] }
}

export interface NativeMediaSidecar {
  schemaVersion: 2
  id: string
  runId: string
  engine: BrowserEngine
  browserVersion: string
  generation?: { candidates: string[], cssHash: string }
  observation: MediaObservation
  warnings: string[]
  error?: string
}
