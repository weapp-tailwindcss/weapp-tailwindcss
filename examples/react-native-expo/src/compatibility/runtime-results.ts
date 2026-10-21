import type { NativeCaseReceipt, ReactNativeCaseResult } from './protocol'
import { nativeFixtures } from './fixtures'

interface RuntimeFailure { id: string, phase: string, error: unknown }

/** 成功和失败共用逐阶段投影，半完成案例不得变成支持，已完成证据不得在后续失败时丢失。 */
export function projectRuntimeResults(results: ReactNativeCaseResult[], observed: ReadonlyMap<string, ReactNativeCaseResult['checkpoints']>, receipts: NativeCaseReceipt[], failure?: RuntimeFailure): ReactNativeCaseResult[] {
  return results.map((result) => {
    const runtime = observed.get(result.id) ?? []
    const currentFailure = failure?.id === result.id ? failure : undefined
    if (!runtime.length && !currentFailure) {
      return result
    }
    const checkpoints = [
      ...runtime,
      ...(currentFailure ? [{ name: `runtime:${currentFailure.phase}:failure`, passed: false, actual: String(currentFailure.error) }] : []),
    ]
    const fixture = nativeFixtures[result.id]
    const complete = fixture && (fixture.phases ?? ['default']).every(phase =>
      receipts.filter(receipt => receipt.id === result.id && receipt.phase === phase).length === 1
      && ['style', 'geometry', 'pixel', 'control'].every(kind => checkpoints.filter(checkpoint => checkpoint.name === `runtime:${phase}:${kind}` && checkpoint.passed).length === 1))
    const failed = Boolean(currentFailure) || checkpoints.some(checkpoint => !checkpoint.passed)
      || !result.generated || !result.encoded || result.warnings.length > 0
    return {
      ...result,
      status: failed ? 'failed' : complete ? 'supported' : 'unverified',
      reason: currentFailure ? String(currentFailure.error) : failed ? '本轮原生语义或参考节点像素不匹配' : complete ? undefined : '本轮只完成部分语义阶段，仍缺少独立运行时证据',
      checkpoints: [...result.checkpoints, ...checkpoints],
    }
  })
}
