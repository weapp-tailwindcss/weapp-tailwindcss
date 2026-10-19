import type { NativeEvidenceContext, NativePlatformReport } from '../../examples/react-lynx/src/compatibility/types'
import fs from 'node:fs/promises'
import path from 'node:path'
import { overflowContract as contract } from '../../examples/react-lynx/src/compatibility/overflow-contract'
import { readNativeHostGeometry } from './geometry-evidence'
import { evaluateOverflow } from './overflow'
import { PNG } from './png'

/** 先验证本轮原生侧车及 PNG 字节身份，再重算裁剪语义，不信任报告自报结论。 */
export async function readOverflowEvidence(report: NativePlatformReport, directory: string, expected: NativeEvidenceContext) {
  const geometry = await readNativeHostGeometry(report, directory, expected, contract.id)
  const [probe, control] = await Promise.all(['probe', 'control'].map(async frame => PNG.sync.read(await fs.readFile(path.join(directory, `${contract.id}-geometry-${frame}.png`)))))
  return evaluateOverflow(geometry, probe!, control!)
}
