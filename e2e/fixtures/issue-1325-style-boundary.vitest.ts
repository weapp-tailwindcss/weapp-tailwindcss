import path from 'node:path'
import base from '../../packages/weapp-tailwindcss/vitest.config'

// 手动运行的原始复现入口；相同语义同时纳入常规包单测。
export default {
  ...base,
  root: path.resolve(import.meta.dirname, '../../packages/weapp-tailwindcss'),
  test: {
    ...base.test,
    include: ['../../e2e/fixtures/issue-1325-style-boundary.repro.test.ts'],
    maxWorkers: 1,
  },
}
