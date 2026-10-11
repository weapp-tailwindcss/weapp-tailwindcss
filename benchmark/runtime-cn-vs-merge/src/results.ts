import type { LatencyStats } from './stats'
import type { SubjectId } from './subjects'

export interface CaseBench {
  id: string
  title: string
  conflict: boolean
  coldStartNs: number
  steady: LatencyStats
  heapDeltaBytes: number | null
}

export interface CaseParity {
  id: string
  title: string
  conflict: boolean
  outputs: Record<SubjectId, string>
  weappEqual: boolean
  weappCnVsMerge: boolean
  weappSlimVsMerge: boolean
  upstreamEqual: boolean
  upstreamMergeEqual: boolean
  escapeDelta: boolean
}
