import { assertWeappViteWatchReady } from '../../scripts/ci/demo-matrix/process.mjs'

export function hasInitialCompileEvidence(name: string, logs: string, lastCompileSuccessAt: number, elapsedMs: number) {
  if (name === 'weapp-vite-tailwindcss-v4') {
    try {
      assertWeappViteWatchReady(logs)
      return true
    }
    catch {
      return false
    }
  }
  // 其余包装器不一定转发内部 builder 的成功行，保留既有稳定窗口。
  return lastCompileSuccessAt > 0 || (elapsedMs >= 8_000 && /Tailwind CSS|Weapp-tailwindcss/u.test(logs))
}
