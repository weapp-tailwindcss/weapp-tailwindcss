import type { NativePlatformReport } from '../../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { MEDIA_GATE_PROBE_IDS, validateMediaGateEvidence } from '../../examples/react-lynx/src/compatibility/media-gate-contract'
import { PNG } from './png'

/** 仅验证无伪状态的媒体探针；负向合同不能把未执行的 hover 输入写成通过。 */
export async function validateMediaGateArtifacts(report: NativePlatformReport, directory: string) {
  validateMediaGateEvidence(report.mediaGate, report.evidence)
  const evidence = report.mediaGate
  const sidecar = JSON.parse(await fs.readFile(path.join(directory, 'media-hover-v1.native.json'), 'utf8'))
  if (sidecar.version !== 1 || sidecar.source !== 'lynx-native-media-gate-v1'
    || sidecar.context?.version !== 1 || sidecar.context.runId !== evidence.runId || sidecar.context.bundleSha256 !== evidence.bundleSha256) {
    throw new Error('Lynx media gate 原生侧车身份无效')
  }
  validateMediaGateEvidence(sidecar.mediaGate, report.evidence)
  for (const key of ['limitationId', 'runId', 'bundleSha256', 'sdkVersion'] as const) {
    if (sidecar.mediaGate[key] !== evidence[key]) throw new Error(`Lynx media gate 原生侧车 ${key} 不符`)
  }
  const ratio = report.environment.viewport.pixelRatio
  if (!Number.isFinite(ratio) || ratio <= 0) throw new Error('Lynx media gate 缺少真实像素比')
  for (const id of MEDIA_GATE_PROBE_IDS) {
    const probe = evidence.probes.find(item => item.id === id)!
    const raw = sidecar.mediaGate.probes.find((item: { id: string }) => item.id === id)
    for (const role of ['probe', 'container'] as const) {
      for (const key of ['width', 'height', 'left', 'right', 'top', 'bottom'] as const) {
        if (raw[role][key] !== probe[role][key]) throw new Error(`Lynx media gate ${id} 原生几何侧车不符`)
      }
    }
    const image = PNG.sync.read(await fs.readFile(path.join(directory, `media-hover-v1-${id}.png`)))
    if (Math.abs(image.width - probe.container.width * ratio) > 1 || Math.abs(image.height - probe.container.height * ratio) > 1) {
      throw new Error(`Lynx media gate ${id} PNG 尺寸不符合原生容器`)
    }
    const positive = id === 'unguarded' || id === 'min-width'
    const color = positive ? [22, 163, 74] : [220, 38, 38]
    let foreground = 0
    let background = 0
    let invalid = 0
    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        // 边缘取整最多影响一个像素，只跳过理论矩形的边界带。
        const cssX = (x + 0.5) / ratio
        const cssY = (y + 0.5) / ratio
        const width = positive ? 32 : 16
        if (Math.abs(cssX - width) < 1 / ratio || Math.abs(cssY - 16) < 1 / ratio) continue
        const inside = cssX < width && cssY < 16
        const expected = inside ? color : [255, 255, 255]
        const offset = (y * image.width + x) * 4
        if (image.data[offset + 3]! < 250 || expected.some((value, channel) => Math.abs(image.data[offset + channel]! - value) > 4)) invalid++
        if (inside) foreground++
        else background++
      }
    }
    if (foreground < 100 * ratio * ratio || background < 2000 * ratio * ratio || invalid > 0) {
      throw new Error(`Lynx media gate ${id} 原始 PNG 颜色或几何与预先声明的正负向合同不符`)
    }
  }
}
