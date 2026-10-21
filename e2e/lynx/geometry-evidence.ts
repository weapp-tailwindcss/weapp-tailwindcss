import type { NativeEvidenceContext, NativeGeometryEvidence, NativePlatformReport } from '../../examples/react-lynx/src/compatibility/types'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { fixedSizeContract, validNativeScreenMetrics } from '../../examples/react-lynx/src/compatibility/fixed-size-contract'
import { geometryArtifactNames, validNativeGeometry } from '../../examples/react-lynx/src/compatibility/native-geometry'
import { validateFixedSizePixels } from './fixed-size-pixels'
import { PNG } from './png'

/** 离线验收与能力适配器重读同一份原生侧车及实际 PNG，不信任报告自证。 */
export async function readNativeHostGeometry(raw: NativePlatformReport, directory: string, expected: NativeEvidenceContext, id: string): Promise<NativeGeometryEvidence> {
  return readHostGeometry(raw, directory, expected, id, raw.results.find(item => item.id === id)?.geometry)
}

/** 非 catalog 夹具显式提供报告测量；其余身份、哈希与宿主 sidecar 检查保持相同。 */
export async function readHostGeometry(raw: NativePlatformReport, directory: string, expected: NativeEvidenceContext, id: string, reportedGeometry: NativeGeometryEvidence | undefined): Promise<NativeGeometryEvidence> {
  const names = geometryArtifactNames(id)
  async function read(name: string) {
    const entries = raw.evidence?.artifacts.filter(item => item.name === name) ?? []
    if (entries.length !== 1 || entries[0]!.runId !== expected.runId) {
      throw new Error(`几何缺少唯一的本轮宿主回执：${id}/${name}`)
    }
    const bytes = await readFile(path.join(directory, name))
    if (bytes.byteLength !== entries[0]!.byteLength || createHash('sha256').update(bytes).digest('hex') !== entries[0]!.sha256) {
      throw new Error(`几何宿主证据字节不匹配：${id}/${name}`)
    }
    return bytes
  }
  const value = JSON.parse((await read(names[2]!)).toString('utf8'))
  if (value.version !== 1 || value.source !== 'lynx-native-host-geometry-v1' || value.id !== id || value.runId !== expected.runId
    || raw.evidence?.runId !== expected.runId || value.bundleSha256 !== expected.bundleSha256 || value.bundleSha256 !== raw.evidence.bundleSha256
    || value.platform !== raw.platform || !validNativeGeometry(value.geometry)
    || !isDeepStrictEqual(value.geometry, reportedGeometry)) {
    throw new Error(`几何宿主侧车身份或独立测量与报告不一致：${id}`)
  }
  const scale = raw.environment.viewport.pixelRatio
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`几何宿主截图缺少实际像素比例：${id}`)
  }
  const images: PNG[] = []
  for (const [index, frame] of (['probe', 'control'] as const).entries()) {
    const png = PNG.sync.read(await read(names[index]!))
    images.push(png)
    const rect = value.geometry[`${frame}Container`]
    if (Math.abs(png.width - rect.width * scale) > 2 || Math.abs(png.height - rect.height * scale) > 2
      || !png.data.some((channel, offset) => offset % 4 === 3 && channel > 0)) {
      throw new Error(`几何宿主截图尺寸或可见区域不匹配：${id}/${frame}`)
    }
  }
  if (id === fixedSizeContract.id) {
    const screen = value.screenMetrics
    const reported = raw.results.find(item => item.id === id)?.screenMetrics
    // 现有v1环境补全保留 Android wm size 的物理像素；iOS模拟器补全已转换为逻辑点。
    const environmentScale = raw.platform === 'android' ? scale : 1
    if (!validNativeScreenMetrics(screen) || !isDeepStrictEqual(screen, reported)
      || Math.abs(screen.width - raw.environment.viewport.width / environmentScale) > 0.01
      || Math.abs(screen.height - raw.environment.viewport.height / environmentScale) > 0.01
      || Math.abs(screen.pixelRatio - scale) > 0.01) {
      throw new Error('固定尺寸缺少一致的本轮原生 screen 侧车、报告或环境')
    }
    validateFixedSizePixels(images, screen)
  }
  return value.geometry
}
