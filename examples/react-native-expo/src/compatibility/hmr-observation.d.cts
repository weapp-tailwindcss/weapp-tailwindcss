export interface HmrObservationSnapshot {
  schemaVersion: 1
  identity: { runId: string, invocationId: string }
  boundary: 'original-metro-client-websocket'
  initialBundle: 'not-captured'
  evaluator: 'not-captured'
  connections: Array<{ id: number, url: string }>
  records: Array<{ sequence: number, connectionId: number, kind: 'message-received' | 'send-returned', receivedAtMs: number, data: string }>
  errors: string[]
  failed?: boolean
}
export function readHmrObservation(realm?: object): HmrObservationSnapshot
export function createObservedHmrClient(Base: new (...args: any[]) => any, identity: HmrObservationSnapshot['identity'], realm?: object, limits?: { maxCharacters?: number, maxRecords?: number }): new (...args: any[]) => any
