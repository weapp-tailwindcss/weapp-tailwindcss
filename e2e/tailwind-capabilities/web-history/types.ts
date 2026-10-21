import type { BrowserEngine } from '../types'
import type { historyStates } from './fixtures'

export interface HistorySnapshot {
  name: typeof historyStates[number]
  profile: 'history' | 'fresh'
  profileId: string
  sequence: number
  id: string
  runId: string
  url: string
  origin: string
  topOrigin: string
  frames: number[]
  timeOrigin: number
  links: Record<string, { href: string, computed: string, matchesVisited: boolean, borderWidth: string, borderStyle: string, rect: { left: number, top: number, width: number, height: number } }>
  screenshot: string
}

export interface HistorySample extends HistorySnapshot {
  attempt: number
  startedMs: number
  elapsedMs: number
}

export interface HistoryState extends HistorySnapshot {
  observation?: { budgetMs: number, intervalMs: number, elapsedMs: number, samples: HistorySample[] }
}

export interface HistoryProfile {
  name: 'history' | 'fresh'
  id: string
  directory: string
  browserType: BrowserEngine
  persistent: true
  headless: true
  channel: 'chromium' | 'default'
  executable: string
  created: boolean
  closed: boolean
  removed: boolean
}

export interface HistoryNavigation {
  profileId: string
  sequence: number
  eventSequence?: number
  action: 'click' | 'back'
  from: string
  to: string
  status: number | null
  mainFrame: boolean
  trusted?: boolean
  href?: string
}

export interface HistorySidecar {
  schemaVersion: 3
  id: string
  runId: string
  engine: BrowserEngine
  browserVersion: string
  origin: string
  profiles: HistoryProfile[]
  lifecycle: string[]
  generation?: { candidates: string[], cssHash: string }
  states: HistoryState[]
  navigation: HistoryNavigation[]
  requests: { path: string, method: string, status: number, sequence: number }[]
  cleanup: { closedProfiles: string[], removedProfiles: string[], serverClosed: boolean, errors: string[] }
  warnings: string[]
  observationFailures: { attempt: number, startedMs: number, elapsedMs: number, screenshot: string, error: string }[]
  error?: string
}
