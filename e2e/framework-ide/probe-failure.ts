import { WechatEnvironmentError, wechatProtocolEnvironmentError } from '../../scripts/wechat/errors'
import { FrameworkIdeCleanupError } from './cleanup'

// 子进程日志可能继承到终端；退出码始终传递本轮不可恢复的环境/收尾终态。
export const IDE_PROBE_BLOCKED_EXIT_CODE = 78

/** 沿真实异常类型和 cause/聚合链分类，不让产品日志中的错误名称决定调度。 */
export function frameworkIdeProbeExitCode(error: unknown): number {
  const pending = [error]
  const seen = new Set<Error>()
  while (pending.length > 0) {
    const current = pending.pop()
    if (!(current instanceof Error) || seen.has(current)) {
      continue
    }
    seen.add(current)
    if (current instanceof WechatEnvironmentError || current instanceof FrameworkIdeCleanupError
      || wechatProtocolEnvironmentError(current)) {
      return IDE_PROBE_BLOCKED_EXIT_CODE
    }
    pending.push(current.cause, ...(current instanceof AggregateError ? current.errors : []))
  }
  return 1
}
