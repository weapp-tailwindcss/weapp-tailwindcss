import { defineConfig } from 'vitest/config'
import { workspaceMaxWorkers } from '../../scripts/testing/vitest-workers.mjs'

export default defineConfig({
  test: {
    maxWorkers: workspaceMaxWorkers,
    include: ['test/**/*.test.mjs'],
    testTimeout: 30_000,
    // 真实 watcher 的测量合同独占执行组，避免其它测试的文件变更污染通知时延。
    sequence: { groupOrder: 1 },
    fileParallelism: false,
  },
})
