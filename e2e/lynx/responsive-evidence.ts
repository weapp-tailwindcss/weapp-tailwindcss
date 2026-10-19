import type { NativeEvidenceContext, NativePlatformReport } from '../../examples/react-lynx/src/compatibility/types'
import type { ResponsiveFrames, ResponsiveImages } from './responsive'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import { responsiveArtifactNames, responsiveContract } from '../../examples/react-lynx/src/compatibility/responsive-contract'
import { PNG } from './png'
import { evaluateResponsive, validateResponsiveFrames } from './responsive'

/** 原生侧车逐帧重读并对照报告，实际 PNG 与请求值、JS 自报尺寸不能互相替代。 */
export async function readResponsiveEvidence(report: NativePlatformReport, directory: string, expected: NativeEvidenceContext) {
  const frames = {} as ResponsiveFrames
  const images = {} as ResponsiveImages
  async function read(name: string) {
    const entries = report.evidence?.artifacts.filter(receipt => receipt.name === name) ?? []
    if (entries.length !== 1 || entries[0]!.runId !== expected.runId) {
      throw new Error(`响应式缺少唯一的本轮宿主回执：${name}`)
    }
    const bytes = await fs.readFile(path.join(directory, name))
    if (bytes.byteLength !== entries[0]!.byteLength || createHash('sha256').update(bytes).digest('hex') !== entries[0]!.sha256) {
      throw new Error(`响应式宿主证据字节不匹配：${name}`)
    }
    return bytes
  }
  for (const phase of responsiveContract.phases) {
    const names = responsiveArtifactNames(phase)
    const sidecar = JSON.parse((await read(names[2]!)).toString('utf8'))
    if (sidecar.version !== 1 || sidecar.source !== 'lynx-native-responsive-v1' || sidecar.platform !== report.platform
      || sidecar.bundleSha256 !== expected.bundleSha256 || report.evidence?.bundleSha256 !== expected.bundleSha256
      || report.evidence.runId !== expected.runId || sidecar.frame?.phase !== phase
      || !isDeepStrictEqual(sidecar.frame, report.results.find(result => result.id === responsiveContract.id)?.responsive?.[phase])) {
      throw new Error('响应式原生侧车与本轮身份、独立测量或报告不符')
    }
    frames[phase] = sidecar.frame
    images[phase] = { probe: PNG.sync.read(await read(names[0]!)), control: PNG.sync.read(await read(names[1]!)) }
  }
  validateResponsiveFrames(frames, expected.runId)
  if (frames.narrow.viewport.pixelRatio !== report.environment.viewport.pixelRatio) {
    throw new Error('响应式宿主像素比例与本轮环境不符')
  }
  return { frames, images, measured: evaluateResponsive(frames, images, expected.runId) }
}
