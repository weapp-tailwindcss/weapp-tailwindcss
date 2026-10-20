import type { NativeEvidenceWriter } from './native-evidence'
import type { NativeCaseResult } from './types'
import { responsiveContract } from './responsive-contract'

let sequence = 0
const collecting = new WeakSet<NativeEvidenceWriter>()

/** 宿主选择跨越独立标尺的真实根尺寸；失败路径也必须尝试恢复原始布局。 */
export async function collectResponsive(evidence: NativeEvidenceWriter): Promise<NativeCaseResult> {
  if (collecting.has(evidence)) {
    throw new Error('原生响应式采集已在进行')
  }
  collecting.add(evidence)
  const responsive = {} as NonNullable<NativeCaseResult['responsive']>
  const errors: unknown[] = []
  try {
    for (const phase of ['narrow', 'wide', 'narrowed'] as const) {
      responsive[phase] = await evidence.responsive(phase, `responsive-${++sequence}`)
    }
  }
  catch (error) {
    errors.push(error)
  }
  finally {
    try {
      responsive.restored = await evidence.responsive('restored', `responsive-${++sequence}`)
    }
    catch (error) {
      errors.push(new Error('原生响应式根 viewport 恢复失败', { cause: error }))
    }
    collecting.delete(evidence)
  }
  if (errors.length) {
    throw new AggregateError(errors, '原生响应式采集或恢复失败')
  }
  return { id: responsiveContract.id, status: 'not-tested', reason: '已采集根 viewport 窄、宽、窄及恢复的独立宿主证据，等待验证媒体条件', checkpoints: [{ name: responsiveContract.checkpoint, passed: false }], responsive }
}
