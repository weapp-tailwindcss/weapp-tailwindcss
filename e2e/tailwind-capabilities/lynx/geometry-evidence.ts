import type { NativeGeometryEvidence, NativePlatformReport } from '../../../examples/react-lynx/src/compatibility/types'
import type { RunContext } from '../context'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { digest } from '../identity'
import { readLynxFrame } from './evidence'

/** 几何只能从宿主独立落盘的侧车读取；report 中的坐标不能成为自己的证明。 */
export async function readLynxGeometry(context: RunContext, raw: NativePlatformReport, id: string): Promise<NativeGeometryEvidence> {
  const name = `${id}-geometry.json`
  const entries = raw.evidence?.artifacts.filter(item => item.name === name) ?? []
  if (entries.length !== 1 || entries[0]!.runId !== context.runId) {
    throw new Error(`几何缺少唯一的宿主侧车回执：${id}`)
  }
  const bytes = await readFile(path.join(context.directory, 'native', 'crops', context.runId, name))
  if (bytes.byteLength !== entries[0]!.byteLength || digest(bytes) !== entries[0]!.sha256) {
    throw new Error(`几何宿主侧车字节不匹配：${id}`)
  }
  const value = JSON.parse(bytes.toString('utf8'))
  if (value.version !== 1 || value.source !== 'lynx-native-host-geometry-v1' || value.id !== id || value.runId !== context.runId
    || value.bundleSha256 !== raw.evidence?.bundleSha256 || value.platform !== raw.platform || !value.geometry
    || !isDeepStrictEqual(value.geometry, raw.results.find(item => item.id === id)?.geometry)) {
    throw new Error(`几何宿主侧车身份或独立测量与报告不一致：${id}`)
  }
  const scale = raw.environment.viewport.pixelRatio
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error(`几何宿主截图缺少实际像素比例：${id}`)
  }
  for (const frame of ['probe', 'control'] as const) {
    const png = await readLynxFrame(context, raw, `${id}-geometry-${frame}.png`)
    const rect = value.geometry[`${frame}Container`]
    if (!rect || Math.abs(png.width - rect.width * scale) > 2 || Math.abs(png.height - rect.height * scale) > 2
      || !png.data.some((channel, index) => index % 4 === 3 && channel > 0)) {
      throw new Error(`几何宿主截图尺寸或可见区域不匹配：${id}/${frame}`)
    }
  }
  return value.geometry
}
