import { vi } from 'vitest'
import * as text from '../../../../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/text'

/** 语义单测保留真实文件检查，宿主 I/O 不推进逻辑时钟；绝对截止由 waiter 专项验证。 */
export function mockOutputEvidencePoll() {
  const now = Date.now()
  vi.spyOn(Date, 'now').mockReturnValue(now)
  return vi.spyOn(text, 'waitFor').mockImplementation(async (predicate, options) => {
    options.signal?.throwIfAborted()
    options.onTick?.()
    const accepted = await predicate()
    options.signal?.throwIfAborted()
    options.onTick?.()
    if (!accepted) {
      throw new Error(options.message)
    }
    return 0
  })
}
