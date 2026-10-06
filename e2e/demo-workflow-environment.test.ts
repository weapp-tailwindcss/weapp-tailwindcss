import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extendedEnvironment } from '../scripts/demo-e2e-workflow/extended-environment'
import { resolveStyleIsolationVariants } from '../scripts/demo-visual-e2e-report/style-isolation'
import { shouldRequireIdeLivePageVisibility } from './frameworkIdeClassHotUpdate'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('扩展环境恢复实际消费者的完整验收范围', () => {
  it.each([undefined, '2', '10'])('覆盖 watch 重试配置 %s，保留首次功能失败', (attempts) => {
    const source = { E2E_WATCH_MAX_ATTEMPTS: attempts, E2E_WATCH_CONFIRM_PERFORMANCE_BUDGET: '1' }
    const env = extendedEnvironment(source)

    expect(env.E2E_WATCH_MAX_ATTEMPTS).toBe('1')
    expect(env.E2E_WATCH_CONFIRM_PERFORMANCE_BUDGET).toBe('1')
    expect(source.E2E_WATCH_MAX_ATTEMPTS).toBe(attempts)
  })

  it.each(['style-isolation-default', 'style-isolation-v2'])('清除 %s 筛选后执行两种样式隔离模式', (variant) => {
    vi.stubEnv('DEMO_VISUAL_STYLE_ISOLATION_VARIANT', variant)
    expect(resolveStyleIsolationVariants('uni-app-x-tailwindcss-v4')).toHaveLength(1)

    const env = extendedEnvironment(process.env)
    expect(process.env.DEMO_VISUAL_STYLE_ISOLATION_VARIANT).toBe(variant)
    vi.stubEnv('DEMO_VISUAL_STYLE_ISOLATION_VARIANT', env.DEMO_VISUAL_STYLE_ISOLATION_VARIANT)

    expect(resolveStyleIsolationVariants('uni-app-x-tailwindcss-v4')).toEqual([
      { key: 'style-isolation-default' },
      { key: 'style-isolation-v2', styleIsolationVersion: '2' },
    ])
    expect(resolveStyleIsolationVariants('uni-app-vite-vue3-tailwindcss-v4')).toEqual([{}])
  })

  it('清除全局可见性降级后恢复 IDE 页面验证，保留既有用例级边界', () => {
    vi.stubEnv('E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY', '0')
    expect(shouldRequireIdeLivePageVisibility()).toBe(false)

    const env = extendedEnvironment(process.env)
    expect(process.env.E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY).toBe('0')
    vi.stubEnv('E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY', env.E2E_IDE_REQUIRE_LIVE_PAGE_VISIBILITY)

    expect(shouldRequireIdeLivePageVisibility()).toBe(true)
    expect(shouldRequireIdeLivePageVisibility({ name: 'uni-app-x-vdom-tailwindcss-v4' })).toBe(false)
  })
})
