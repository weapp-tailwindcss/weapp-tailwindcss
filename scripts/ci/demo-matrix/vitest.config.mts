import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['scripts/ci/demo-matrix/*.test.mjs'],
    update: 'none',
    // watcher 回归会启动真实 Rollup 子进程；限制同批文件并发，避免高负载下
    // 原生文件事件和 5 秒失效断言被其他矩阵进程长期饥饿。
    maxWorkers: 2,
  },
})
