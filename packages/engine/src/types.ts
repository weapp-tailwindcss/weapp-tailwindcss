import type { SourceEntry } from '@tailwindcss/oxide'

export interface TailwindTokenLocation {
  rawCandidate: string
  file: string
  relativeFile: string
  extension: string
  start: number
  end: number
  length: number
  line: number
  column: number
  lineText: string
}

export type TailwindTokenFileKey = 'relative' | 'absolute'

export interface TailwindTokenReport {
  entries: TailwindTokenLocation[]
  filesScanned: number
  sources: SourceEntry[]
  skippedFiles: {
    file: string
    reason: string
  }[]
}

export type TailwindTokenByFileMap = Record<string, TailwindTokenLocation[]>
