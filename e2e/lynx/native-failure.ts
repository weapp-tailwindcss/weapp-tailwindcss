import type { NativeEvidenceFailureCode } from '../../examples/react-lynx/src/compatibility/native-failure'
import { readNativeEvidenceFailure } from '../../examples/react-lynx/src/compatibility/native-failure'

type HarnessFailureReason = NativeEvidenceFailureCode | 'report-timeout'
const marker = 'LYNX_NATIVE_HARNESS_FAILURE '

export class LynxHarnessBlockedError extends Error {
  readonly code = 'LYNX_NATIVE_HARNESS_BLOCKED'

  constructor(readonly reason: HarnessFailureReason, message: string) {
    super(message)
    this.name = 'LynxHarnessBlockedError'
  }
}

export function nativeFailureError(source: string): Error {
  let message = source.trim() || 'unknown native evidence failure'
  try {
    const outer = JSON.parse(source) as { message?: unknown }
    if (typeof outer.message === 'string' && outer.message.trim()) {
      message = outer.message
    }
  }
  catch {
    // 旧宿主的纯文本保留为产品失败，不按关键词推断环境状态。
  }
  try {
    const failure = readNativeEvidenceFailure(JSON.parse(message))
    if (failure) {
      return new LynxHarnessBlockedError(failure.code, `原生兼容性取证中断：${failure.message}`)
    }
  }
  catch {
    // 普通错误消息无需符合结构化协议。
  }
  return new Error(`原生兼容性报告执行失败：${message}`)
}

function harnessErrorIn(error: unknown, seen = new Set<unknown>()): LynxHarnessBlockedError | undefined {
  if (!(error instanceof Error) || seen.has(error) || seen.size >= 32) {
    return
  }
  seen.add(error)
  if (error instanceof LynxHarnessBlockedError) {
    return error
  }
  for (const nested of [...(error instanceof AggregateError ? error.errors : []), error.cause]) {
    const found = harnessErrorIn(nested, seen)
    if (found) {
      return found
    }
  }
}

/** 单行帧仅承载已识别的环境错误，便于父调度器跨子进程恢复错误类别。 */
export function formatLynxHarnessFailure(error: unknown): string | undefined {
  const failure = harnessErrorIn(error)
  if (failure) {
    return `${marker}${JSON.stringify({ version: 1, source: 'lynx-native-runner', category: 'environment', code: failure.code, reason: failure.reason, message: failure.message })}`
  }
}

export function parseLynxHarnessFailure(output: string): string | undefined {
  for (const line of output.split(/\r?\n/)) {
    if (!line.startsWith(marker)) {
      continue
    }
    try {
      const value = JSON.parse(line.slice(marker.length)) as Record<string, unknown>
      const reasonValid = value.reason === 'report-timeout' || readNativeEvidenceFailure({ version: 1, source: 'lynx-native-evidence', category: 'environment', code: value.reason, message: value.message })
      if (value.version === 1 && value.source === 'lynx-native-runner' && value.category === 'environment' && value.code === 'LYNX_NATIVE_HARNESS_BLOCKED'
        && reasonValid && typeof value.message === 'string' && value.message.trim()) {
        return value.message
      }
    }
    catch {
      // 截断或伪造的帧不能将普通测试失败提升为环境故障。
    }
  }
}
