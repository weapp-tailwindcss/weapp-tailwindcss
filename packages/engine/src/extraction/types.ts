import type { BareArbitraryValueOptions } from '../v4/bare-arbitrary-values.ts'

export interface ExtractCandidateOptions {
  bareArbitraryValues?: boolean | BareArbitraryValueOptions
}

export interface ExtractSourceCandidate {
  rawCandidate: string
  start: number
  end: number
}

export interface ExtractSourceCandidateWithContext extends ExtractSourceCandidate {
  content: string
  extension: string
  localStart: number
  skipHtmlContextChecks?: boolean
}

export interface JsStringStaticRange {
  start: number
  end: number
}

export interface SourceSegment {
  content: string
  start: number
}

export interface JoinedSourceSegment extends SourceSegment {
  joinedStart: number
}
