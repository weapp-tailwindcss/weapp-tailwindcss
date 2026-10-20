import type { NativeMediaGateCapture } from '../types'
import { MEDIA_GATE_LIMITATION_ID, MEDIA_GATE_PROBE_IDS, mediaGateArtifactNames } from '../media-gate-contract'

export function mediaCapture(): NativeMediaGateCapture {
  const runId = '00000000-0000-4000-8000-000000000001'
  const rect = (width: number, height: number) => ({ left: 2, top: 3, right: 2 + width, bottom: 3 + height, width, height })
  return {
    mediaGate: {
      limitationId: MEDIA_GATE_LIMITATION_ID,
      runId,
      bundleSha256: 'a'.repeat(64),
      sdkVersion: '4.0.1',
      probes: MEDIA_GATE_PROBE_IDS.map(id => ({ id, probe: rect(id === 'unguarded' || id === 'min-width' ? 32 : 16, 16), container: rect(64, 64) })),
    },
    artifacts: mediaGateArtifactNames().map(name => ({ runId, name, sha256: 'b'.repeat(64), byteLength: 100 })),
  }
}
