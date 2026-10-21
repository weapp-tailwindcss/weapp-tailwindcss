import type { NativePlatformReport } from '../../../examples/react-lynx/src/compatibility/types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { compatibilityCases } from '../../../examples/react-lynx/src/compatibility/catalog'
import { evaluateGeometry } from '../../../examples/react-lynx/src/compatibility/geometry'
import { PNG } from '../png'

/** 合成完整协议输入，仅验证存储与重放，不作为实际设备支持证据。 */
export function fixedSizeArtifactFixture(report: NativePlatformReport) {
  const id = 'sizing-fixed'
  const { pixelRatio: scale } = report.environment.viewport
  const environmentScale = report.platform === 'android' ? scale : 1
  const width = report.environment.viewport.width / environmentScale
  const height = report.environment.viewport.height / environmentScale
  const screenMetrics = { version: 1 as const, source: 'lynx-native-screen-v1' as const, width, height, pixelRatio: scale }
  const probeHeight = 45 * width / 750
  const rect = (left: number, top: number, width: number, height: number) => ({ left, top, width, height, right: left + width, bottom: top + height })
  const geometry = {
    probeContainer: rect(10, 20, 160, 96),
    controlContainer: rect(200, 300, 160, 96),
    probe: rect(18, 28, 123, probeHeight),
    control: rect(208, 308, 80, 64),
    probeChild: rect(22, 32, 4, 4),
    controlChild: rect(212, 312, 4, 4),
  }
  Object.assign(report.results.find(result => result.id === id)!, evaluateGeometry(compatibilityCases.find(item => item.id === id)!, geometry, screenMetrics))
  const evidence = report.evidence!
  const files = new Map<string, Buffer>()
  files.set(`${id}-geometry.json`, Buffer.from(JSON.stringify({ ...evidence, artifacts: undefined, source: 'lynx-native-host-geometry-v1', platform: report.platform, id, geometry, screenMetrics })))
  for (const frame of ['probe', 'control'] as const) {
    const image = new PNG({ width: Math.round(160 * scale), height: Math.round(96 * scale) })
    const bodyWidth = frame === 'probe' ? 123 : 80
    const bodyHeight = frame === 'probe' ? probeHeight : 64
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const cx = (x + 0.5) / scale
        const cy = (y + 0.5) / scale
        const body = cx >= 8 && cx < 8 + bodyWidth && cy >= 8 && cy < 8 + bodyHeight
        const marker = cx >= 12 && cx < 16 && cy >= 12 && cy < 16
        image.data.set(marker ? [249, 115, 22, 255] : body ? [37, 99, 235, 255] : [255, 255, 255, 255], (y * image.width + x) * 4)
      }
    }
    files.set(`${id}-geometry-${frame}.png`, PNG.sync.write(image))
  }
  for (const [name, bytes] of files) {
    evidence.artifacts.push({ runId: evidence.runId, name, sha256: createHash('sha256').update(bytes).digest('hex'), byteLength: bytes.byteLength })
  }
  return files
}
