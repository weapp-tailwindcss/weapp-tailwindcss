import type { NativeGeometryEvidence, NativePlatformReport, NativeRect } from '../../../examples/react-lynx/src/compatibility/types'
import { createHash } from 'node:crypto'
import { Buffer } from 'node:buffer'
import { PNG } from '../png'

const rect = (left: number, top: number, width: number, height: number): NativeRect => ({ left, top, width, height, right: left + width, bottom: top + height })

/** 独立合成颜色和固定几何仅验证协议，不是设备成功证据。 */
export function themeOverrideArtifacts(report: NativePlatformReport, pixel?: { branch: string, phase: string, rgb: number[] }) {
  const context = { version: 1, runId: report.evidence!.runId, bundleSha256: report.evidence!.bundleSha256 }
  const images = new Map<string, Buffer>()
  const scale = report.environment.viewport.pixelRatio
  if (scale !== 2) {
    throw new Error('合成主题夹具固定使用 2 倍像素，调用者须显式选择该比例')
  }
  const frames = []
  for (const [phaseIndex, phase] of ['before', 'after', 'restored'].entries()) {
    for (const branch of ['tailwind-hex', 'application-hex', 'application-oklch']) {
      const id = `theme-${branch}-${phase}`
      const width = [16, 24, 32][phaseIndex]!
      const geometry: NativeGeometryEvidence = {
        probeContainer: rect(0, 0, 80, 80), controlContainer: rect(100, 0, 80, 80),
        probe: rect(8, 8, 64, 64), control: rect(108, 8, 64, 64),
        probeChild: rect(8, 8, width, 8), controlChild: rect(108, 8, width, 8),
      }
      frames.push({ phase, branch, id, geometry })
      const base = branch === 'application-oklch' ? [230, 80, 0] : [255, 0, 0]
      const rgb = phase === 'after' ? [0, 0, 255] : base
      for (const side of ['probe', 'control'] as const) {
        const image = new PNG({ width: 160, height: 160 })
        for (let y = 0; y < 160; y++) {
          for (let x = 0; x < 160; x++) {
            const inside = x >= 16 && x < 144 && y >= 16 && y < 144
            const marker = inside && x < (8 + width) * 2 && y < 32
            const value = pixel?.branch === branch && pixel.phase === phase && side === 'probe' ? pixel.rgb : rgb
            const channels = inside && !marker ? value : [255, 255, 255]
            const offset = (y * 160 + x) * 4
            image.data.set([...channels, 255], offset)
          }
        }
        save(`${id}-geometry-${side}.png`, PNG.sync.write(image))
      }
      save(`${id}-geometry.json`, new TextEncoder().encode(JSON.stringify({
        version: 1, source: 'lynx-native-host-geometry-v1', platform: report.platform, id, ...context, geometry,
      })))
    }
  }
  report.themeOverrides = { contract: 'lynx-theme-overrides-v1', frames }
  return images

  function save(name: string, data: Uint8Array) {
    images.set(name, Buffer.from(data))
    report.evidence!.artifacts.push({ name, runId: context.runId, byteLength: data.byteLength, sha256: createHash('sha256').update(data).digest('hex') })
  }
}
