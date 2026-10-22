export type Rgba = readonly [number, number, number, number]
export interface WeappPhase {
  name: string
  candidates: readonly string[]
  inline?: string
  reference: string
  expected: Readonly<Record<string, string>>
  referenceExpected?: Readonly<Record<string, string>>
  witness?: { inline: string, expected: Readonly<Record<string, string>> }
  pixel?: { actual: Rgba, reference: Rgba, equal: boolean }
  composite?: import('./compositing').WeappComposite
}

export interface WeappProbe {
  id: string
  candidates: readonly string[]
  property: string
  expected: string
  reference: string
  styles?: Readonly<Record<string, string>>
  inline?: string
  text?: boolean
  empty?: boolean
  pixel?: Rgba
  phases?: readonly WeappPhase[]
  limit?: { id: string, reason: string }
}

export interface WeappRect { left: number, top: number, width: number, height: number }

export interface WeappObservation {
  name: string
  index: number
  input: ReturnType<typeof import('./render').weappPhaseInput>
  identityText: string
  actual: Record<string, string>
  reference: Record<string, string>
  witness: Record<string, string>
  rectangles: { probe: WeappRect, reference: WeappRect, marker: WeappRect, foreground?: WeappRect, background?: WeappRect, gray?: WeappRect }
}

export interface WeappSidecar {
  schemaVersion: 2
  runId: string
  caseId: string
  cssHash: string
  sourceHash: string
  fixtureHash: string
  phases: WeappObservation[]
}
