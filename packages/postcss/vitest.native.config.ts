import { configDefaults, defineConfig } from 'vitest/config'
import base from './vitest.config'

/** 真正加载二进制的差分测试独立运行；缺少或损坏的 binding 必须失败。 */
export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['test/native/**/*.test.ts'],
    exclude: configDefaults.exclude,
    env: { WEAPP_TW_NATIVE: 'required' },
    setupFiles: ['test/native/setup.ts'],
  },
})
