import { afterEach, beforeEach, vi } from 'vitest'

// 本地验收会绑定真实 IDE；单测必须显式声明自己的实例，不能继承宿主选择。
beforeEach(() => {
  vi.stubEnv('HBUILDERX_CLI_PATH', undefined)
  vi.stubEnv('HBUILDERX_CHANNEL', undefined)
  vi.stubEnv('HBUILDERX_HOST', undefined)
})

afterEach(() => vi.unstubAllEnvs())
