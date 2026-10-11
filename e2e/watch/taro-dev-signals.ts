import type { Buffer } from 'node:buffer'
import { normalizeLogLine } from '../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'

export const TARO_COMPILED_RE = /compiled successfully|\bbuilt in \d+(?:\.\d+)?m?s\.?/i
export const TARO_BUILD_ERROR_RE = /syntheticNamedExports|compiled with (?:\d+ )?errors?|error during build|build failed/i
const TARO_WATCH_READY_RE = /→ Watching|watching for file changes/i

export function parseTaroDevSignalLine(line: string) {
  const text = normalizeLogLine(line)
  return {
    compiled: TARO_COMPILED_RE.test(text),
    watchReady: TARO_WATCH_READY_RE.test(text),
    buildFailed: TARO_BUILD_ERROR_RE.test(text),
  }
}

/** 信号以完整日志行为边界；stdout/stderr 分开缓存，避免颜色和分块影响编译状态。 */
export function createTaroDevSignalCollector(onSignal: (signal: ReturnType<typeof parseTaroDevSignalLine>) => void) {
  const pending = { stdout: '', stderr: '' }
  const emit = (line: string) => {
    if (line) {
      onSignal(parseTaroDevSignalLine(line))
    }
  }
  return {
    push(chunk: Buffer | string, stream: keyof typeof pending) {
      const lines = `${pending[stream]}${chunk.toString()}`.split(/\r\n|\r|\n/)
      pending[stream] = lines.pop() ?? ''
      lines.forEach(emit)
    },
    flush() {
      for (const stream of ['stdout', 'stderr'] as const) {
        emit(pending[stream])
        pending[stream] = ''
      }
    },
  }
}
