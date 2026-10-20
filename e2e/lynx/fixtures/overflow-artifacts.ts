import type { NativePlatformReport } from '../../../examples/react-lynx/src/compatibility/types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { geometryArtifactNames } from '../../../examples/react-lynx/src/compatibility/native-geometry'
import { overflowContract as contract } from '../../../examples/react-lynx/src/compatibility/overflow-contract'
import { PNG } from '../png'
import { overflowGeometry, overflowImage } from './overflow-images'

/** 合成落盘协议夹具不代表设备支持；原始结果仍须经离线几何和 PNG 重算。 */
export function overflowArtifactFixture(report: NativePlatformReport, clipped = false) {
  const evidence = report.evidence!
  const geometry = overflowGeometry()
  Object.assign(report.results.find(result => result.id === contract.id)!, { geometry, status: 'not-tested', checkpoints: [{ name: contract.checkpoint, passed: false }] })
  const [probe, control, sidecar] = geometryArtifactNames(contract.id)
  const files = new Map<string, Buffer>([
    [probe!, PNG.sync.write(overflowImage(clipped, report.environment.viewport.pixelRatio))],
    [control!, PNG.sync.write(overflowImage(false, report.environment.viewport.pixelRatio))],
    [sidecar!, Buffer.from(JSON.stringify({ version: 1, source: 'lynx-native-host-geometry-v1', platform: report.platform,
      id: contract.id, runId: evidence.runId, bundleSha256: evidence.bundleSha256, geometry }))],
  ])
  for (const [name, data] of files) {
    evidence.artifacts.push({ runId: evidence.runId, name, sha256: createHash('sha256').update(data).digest('hex'), byteLength: data.byteLength })
  }
  return files
}
