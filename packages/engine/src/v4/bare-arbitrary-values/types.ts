export interface BareArbitraryValueOptions {
  /**
   * 允许作为无方括号任意值的单位列表。
   */
  units?: string[]
}

export interface BareArbitraryValueResolveResult {
  candidate: string
  canonicalCandidate: string
}

export interface BareArbitraryValueSourceCandidate {
  rawCandidate: string
  start: number
  end: number
}
