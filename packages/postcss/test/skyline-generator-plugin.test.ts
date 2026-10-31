import type { WeappTailwindcssPostcssPluginAdapters } from '../src/generator-plugin'
import postcss from 'postcss'
import { vi } from 'vitest'
import { createWeappTailwindcssPostcssPlugin } from '../src/generator-plugin'

const css = 'view,text{--tw-leading:initial;--tw-font-weight:initial}.x{line-height:var(--tw-leading,32px)}'

function plugin(dispose = vi.fn()) {
  const adapters: WeappTailwindcssPostcssPluginAdapters = {
    resolveTailwindV4Source: async () => ({}),
    normalizeGeneratorOptions: options => ({
      target: options?.target ?? 'weapp',
      styleOptions: options?.styleOptions,
      webCompat: false,
      importFallback: true,
    }),
    createGenerator: () => ({
      dispose,
      generate: async request => ({ css, rawCss: css, target: request?.target ?? 'weapp', classSet: new Set(['x']), dependencies: [] }),
    }),
  }
  return createWeappTailwindcssPostcssPlugin(adapters)
}

it.each(['weapp', 'web'] as const)('PostCSS 生成器 finalizer 按实际目标传递 Skyline 配置：%s', async (target) => {
  const result = await postcss([plugin()({ generator: { target }, scanSources: false, styleOptions: { cssOptions: { skyline: true } } })]).process('@tailwind utilities;', { from: undefined })
  if (target === 'weapp') {
    expect(result.css).toContain('--tw-leading:var(--weapp-tw-invalid-reset)')
    expect(result.css).toContain('--tw-font-weight:var(--weapp-tw-invalid-reset)')
  }
  else {
    expect(result.css).toBe(css)
  }
})

it('PostCSS 生成器不吞掉不兼容的 property 配置错误', async () => {
  const dispose = vi.fn()
  await expect(postcss([plugin(dispose)({ scanSources: false, styleOptions: { cssOptions: { skyline: true, cssRemoveProperty: false } } })]).process('@tailwind utilities;', { from: undefined }).async()).rejects.toThrow('cssRemoveProperty: false')
  expect(dispose).toHaveBeenCalledOnce()
})

it('PostCSS 生成器 finalizer 透传旧版平台和 property 策略', async () => {
  const result = await postcss([plugin()({ scanSources: false, styleOptions: { platform: 'mp-alipay', cssOptions: { skyline: true } } })]).process('@tailwind utilities;', { from: undefined })
  expect(result.css).toBe(css)
  await expect(postcss([plugin()({ scanSources: false, styleOptions: { atRules: { property: false }, cssOptions: { skyline: true } } })]).process('@tailwind utilities;', { from: undefined }).async()).rejects.toThrow('保留 @property')
})

it('PostCSS 生成器输入契约失败也释放生成器', async () => {
  const dispose = vi.fn()
  await expect(postcss([plugin(dispose)({ scanSources: false, styleOptions: { cssOptions: { skyline: true } } })]).process('view{--weapp-tw-invalid-reset:1}@tailwind utilities;', { from: undefined }).async()).rejects.toThrow('--weapp-tw-invalid-reset')
  expect(dispose).toHaveBeenCalledOnce()
})
