import type { WatchOptions } from 'vite'

// 等待每次保存完成后再发布，避免连续阶段落入 Node 监听器 50ms 去重窗口。
export const hmrWatchOptions: WatchOptions = {
  awaitWriteFinish: { stabilityThreshold: 60, pollInterval: 10 },
}
