import type { NativePlatformReport } from '../../../examples/react-lynx/src/compatibility/types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { responsiveArtifactNames, responsiveContract } from '../../../examples/react-lynx/src/compatibility/responsive-contract'
import { PNG } from '../png'
import { responsiveFixture } from './responsive-images'

/** 仅构造协议回归用的原生文件，不改写历史报告或代表设备结论。 */
export function responsiveArtifactFixture(report: NativePlatformReport) {
  const evidence = report.evidence!
  const { frames, images } = responsiveFixture(evidence.runId, report.environment.viewport.pixelRatio, report.environment.viewport.width)
  const result = report.results.find(result => result.id === responsiveContract.id)!
  result.responsive = frames
  result.status = 'not-tested'
  result.checkpoints = [{ name: responsiveContract.checkpoint, passed: false }]
  const files = new Map<string, Buffer>()
  for (const phase of responsiveContract.phases) {
    const names = responsiveArtifactNames(phase)
    files.set(names[0]!, PNG.sync.write(images[phase].probe))
    files.set(names[1]!, PNG.sync.write(images[phase].control))
    files.set(names[2]!, Buffer.from(JSON.stringify({ version: 1, source: 'lynx-native-responsive-v1', platform: report.platform,
      bundleSha256: evidence.bundleSha256, frame: frames[phase] })))
  }
  for (const [name, data] of files) {
    evidence.artifacts.push({ runId: evidence.runId, name, sha256: createHash('sha256').update(data).digest('hex'), byteLength: data.byteLength })
  }
  return files
}
