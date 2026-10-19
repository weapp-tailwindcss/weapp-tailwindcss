import type { NativePlatformReport } from '../../../examples/react-lynx/src/compatibility/types'
import type { RunContext } from '../context'
import path from 'node:path'
import { readNativeHostGeometry } from '../../lynx/geometry-evidence'

/** 只消费独立落盘的原生几何与截图，使用调用者固定的本轮身份。 */
export async function readLynxGeometry(context: RunContext, raw: NativePlatformReport, id: string) {
  if (!raw.evidence) {
    throw new Error(`几何缺少本轮宿主身份：${id}`)
  }
  return readNativeHostGeometry(raw, path.join(context.directory, 'native', 'crops', context.runId), { ...raw.evidence, runId: context.runId }, id)
}
