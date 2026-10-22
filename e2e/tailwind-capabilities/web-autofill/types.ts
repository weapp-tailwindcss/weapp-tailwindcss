export interface AutofillCommand {
  method: 'Autofill.enable' | 'Autofill.trigger' | 'Autofill.disable'
  params: Record<string, unknown>
  response?: unknown
  error?: string
}

export interface AutofillEvent {
  filledFields: Array<{ id: string, name: string, value: string, htmlType: string, autofillType: string, fillingStrategy: string, frameId: string, fieldId: number }>
  addressUi: unknown
}

export interface AutofillField {
  value: string
  autofill: boolean
  outline: { width: string, style: string, color: string }
  rect: { left: number, top: number, width: number, height: number }
}

export interface AutofillJournalEntry {
  type: string
  id: string
  value: string
  trusted: boolean
  inputType: string
  key: string
}

export interface AutofillObservation {
  timeline: string[]
  identity?: { frameId: string, backendIds: Record<string, number> }
  commands: AutofillCommand[]
  events: AutofillEvent[]
  states: Array<{ name: string, id: string, runId: string, url: string, frames: number[], fields: Record<string, AutofillField>, journal: AutofillJournalEntry[], screenshot: string }>
  cleanup: { disable?: AutofillCommand, detached: boolean, errors: string[] }
}

export interface AutofillSidecar {
  schemaVersion: 2
  id: string
  runId: string
  engine: 'chromium'
  browserVersion: string
  host: 'full-chromium'
  generation?: { cssHash: string, candidates: string[] }
  observation: AutofillObservation
  warnings: string[]
  error?: string
}
