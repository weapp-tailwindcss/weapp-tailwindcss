import { postcss } from '@weapp-tailwindcss/postcss'
import { createStyleHandler } from '@weapp-tailwindcss/postcss/transform'
import { createCompiler } from '@/core/compiler'
import { createResolvedCompiler } from '@/core/compiler/compiler'
import { finalizeMiniProgramGeneratorCss } from '@/generation/generation-helpers/preflight'
import { resolveGeneratorStyleOptions } from '@/generation/generation-helpers/runtime-isolation'
import { appendLegacyCompatCss } from '@/generation/legacy-compat'

const cssOptions = { colorMixDynamicAlpha: 'rgba' as const }
const source = '.alpha{background-color:color-mix(in srgb,#123456 var(--opacity, 50%),transparent)}'
const expected = 'rgba(18, 52, 86, var(--opacity, 50%))'

function request() {
  return {
    id: 'dynamic-alpha',
    sourceOptions: { base: process.cwd(), css: `@tailwind utilities;${source}` },
    target: 'weapp' as const,
    candidates: ['w-[37px]'],
    scanSources: false as const,
  }
}

describe('公开 Core 动态透明度兼容配置', () => {
  it.each([false, true])('目标查询保持惰性并兼容旧 handler，legacy=%s', async (legacy) => {
    const handler = createStyleHandler({ majorVersion: 4 })
    const pipeline = vi.spyOn(handler, 'getPipeline')
    if (legacy) {
      delete handler.getTarget
    }
    const compiler = createResolvedCompiler({
      transforms: { styleHandler: handler, jsHandler: vi.fn(), templateHandler: async source => source },
    })
    try {
      const snapshot = compiler.createSnapshot({ id: 'target-query', target: 'weapp', classSet: [] })
      expect((await compiler.transformCss(source, snapshot)).css).toContain(expected)
      expect((await compiler.transformCssRoot(postcss.parse(source), snapshot)).css).toContain(expected)
      for (const platform of ['h5', 'mp-weixin']) {
        const output = await compiler.transformCss(source, snapshot, { cssOptions: { platform } })
        expect(output.css.includes(expected)).toBe(platform === 'mp-weixin')
      }
      expect(pipeline.mock.calls.length).toBe(legacy ? 4 : 0)
    }
    finally {
      await compiler.dispose()
    }
  })

  it.each([{}, { rem2rpx: false }])('构建器的无关覆盖保留显式 strict：%j', (cssOptions) => {
    const resolved = resolveGeneratorStyleOptions({ styleOptions: { cssOptions: { colorMixDynamicAlpha: 'strict' } } } as Parameters<typeof resolveGeneratorStyleOptions>[0], {}, { cssOptions })
    expect(resolved.cssOptions?.colorMixDynamicAlpha).toBe('strict')
  })

  it('legacy 补充样式继承 strict，切换生成目标后仍使用实例的原始配置', async () => {
    const handler = createStyleHandler({ majorVersion: 4 })
    const legacy = await appendLegacyCompatCss('', source, 'weapp', handler, { majorVersion: 4, cssOptions: { colorMixDynamicAlpha: 'strict' } }, { cssOptions: { rem2rpx: false } })
    expect(legacy).not.toContain(expected)
    const compiler = createCompiler({ logLevel: 'silent', generator: { target: 'web' }, cssOptions })
    try {
      const snapshot = compiler.createSnapshot({ id: 'switch-target', target: 'weapp', classSet: [] })
      expect((await compiler.transformCss(source, snapshot, { platform: 'mp-weixin' })).css).toContain(expected)
    }
    finally {
      await compiler.dispose()
    }
  })
  it('generate 请求控制生成，实例与调用覆盖控制 string/Root 转换', async () => {
    const compiler = createCompiler({ appType: 'weapp-vite', logLevel: 'silent', cssOptions: { colorMixDynamicAlpha: 'strict' } })
    try {
      const defaults = await compiler.generate(request())
      expect(defaults.css).toContain(expected)
      const strict = await compiler.generate({ ...request(), styleOptions: { cssOptions: { colorMixDynamicAlpha: 'strict' } } })
      expect(strict.css).not.toContain(expected)
      const generated = await compiler.generate({ ...request(), styleOptions: { cssOptions } })
      expect(generated.css).toContain(expected)
      expect((await compiler.transformCss(generated.rawCss, generated.snapshot)).css).not.toContain(expected)
      expect((await compiler.transformCssRoot(postcss.parse(generated.rawCss), generated.snapshot, { cssOptions })).css).toContain(expected)
      expect((await compiler.transformCss(generated.rawCss, generated.snapshot, { cssOptions: { colorMixDynamicAlpha: 'strict' } })).css).not.toContain(expected)
      expect(compiler.finalizeCss(source)).toContain(expected)
      expect(compiler.finalizeCss(source, { cssOptions: { colorMixDynamicAlpha: 'strict' } })).not.toContain(expected)
      expect(compiler.finalizeCss(source, { cssOptions })).toContain(expected)
      const root = postcss.parse(source)
      expect(compiler.finalizeCssRoot(root, { cssOptions }).toString()).toContain(expected)
      expect(root.toString()).toBe(source)
    }
    finally {
      await compiler.dispose()
    }
  })

  it('无实例配置的字符串和 Root 转换默认兼容', async () => {
    const compiler = createCompiler({ logLevel: 'silent' })
    try {
      const snapshot = compiler.createSnapshot({ id: 'default-alpha', target: 'weapp', classSet: [] })
      expect((await compiler.transformCss(source, snapshot)).css).toContain(expected)
      expect((await compiler.transformCssRoot(postcss.parse(source), snapshot)).css).toContain(expected)
    }
    finally {
      await compiler.dispose()
    }
  })

  it('生成缓存按模式隔离，并感知 styleOptions 原位修改', async () => {
    const compiler = createCompiler({ logLevel: 'silent' })
    const options = { cssOptions: { colorMixDynamicAlpha: 'strict' as 'strict' | 'rgba' } }
    const input = { ...request(), styleOptions: options }
    try {
      for (const mode of ['strict', 'rgba', 'strict', 'rgba'] as const) {
        options.cssOptions.colorMixDynamicAlpha = mode
        const generated = await compiler.generate(input)
        expect(generated.css.includes(expected)).toBe(mode === 'rgba')
        expect((await compiler.transformCss(generated.rawCss, generated.snapshot, options)).css.includes(expected)).toBe(mode === 'rgba')
      }
    }
    finally {
      await compiler.dispose()
    }
  })

  it.each([{ platform: 'h5' }, { uniAppX: true, uniAppXCssTarget: 'uvue' as const }])('最终清理也尊重实际样式目标 %j', async (options) => {
    const compiler = createCompiler({ logLevel: 'silent' })
    try {
      const snapshot = compiler.createSnapshot({ id: 'alpha', target: 'weapp', classSet: [] })
      for (const configured of [undefined, cssOptions]) {
        expect(finalizeMiniProgramGeneratorCss(source, 'weapp', 4, false, { styleOptions: { ...options, cssOptions: configured } })).not.toContain(expected)
        expect((await compiler.transformCss(source, snapshot, { ...options, cssOptions: configured })).css).not.toContain(expected)
        expect((await compiler.transformCssRoot(postcss.parse(source), snapshot, { ...options, cssOptions: configured })).css).not.toContain(expected)
      }
    }
    finally {
      await compiler.dispose()
    }
  })

  it('Web 生成与转换不应用兼容模式', async () => {
    const compiler = createCompiler({ logLevel: 'silent', cssOptions })
    try {
      const generated = await compiler.generate({ ...request(), target: 'web', styleOptions: { cssOptions } })
      expect(generated.css).toContain('color-mix(')
      expect(generated.css).not.toContain(expected)
      const transformed = await compiler.transformCss(source, generated.snapshot, { cssOptions })
      expect(transformed.css).not.toContain(expected)
    }
    finally {
      await compiler.dispose()
    }
  })
})
