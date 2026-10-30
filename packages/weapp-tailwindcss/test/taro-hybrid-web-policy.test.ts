import type { InternalUserDefinedOptions } from '@/types'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { compileString } from 'sass'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getCompilerContext } from '@/context'
import { resolveStyleOptionsFromContext } from '@/context/style-options'
import { generatorTargetEnvKeys } from '@/framework-policies/resolve'
import { resolveContextGeneratorConfiguration } from '@/generator/context-options'
import { resolveGeneratorConfiguration } from '@/generator/options'
import { createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

beforeEach(() => {
  for (const key of generatorTargetEnvKeys) {
    vi.stubEnv(key, undefined)
  }
})
afterEach(() => vi.unstubAllEnvs())

function expectDimensions(css: string, selector: string) {
  const declarations: Record<string, string> = {}
  postcss.parse(css).walkRules(selector, (rule) => {
    rule.walkDecls((declaration) => {
      declarations[declaration.prop] = declaration.value
    })
  })
  expect(declarations).toMatchObject({ height: '4rem', width: '25rem' })
}

describe('Taro Hybrid Web 单位策略', () => {
  it.each(['h5', 'harmony-hybrid', ' HARMONY-HYBRID '])('%s 保留生成样式的 rem，避免进入 Taro 前转成 rpx', async (platform) => {
    vi.stubEnv('TARO_ENV', platform)
    expect(resolveGeneratorConfiguration(undefined, { appType: 'taro' }).options.target).toBe('web')
    const ctx = getCompilerContext({ appType: 'taro', generator: { target: 'web' }, rem2rpx: true, cssPreflight: false })
    expect(resolveStyleOptionsFromContext(ctx).rem2rpx).toBe(false)
    const { css } = await ctx.styleHandler('.arbitrary{height:4rem;width:25rem}.theme{--spacing:.25rem}')
    expect(css).toMatch(/height:\s*4rem/)
    expect(css).toMatch(/width:\s*25rem/)
    expect(css).toMatch(/--spacing:\s*0?\.25rem/)
    expect(css).not.toContain('rpx')
  })

  it.each(['harmony', 'rn', 'weapp', 'unknown'])('%s 保留原生或小程序默认分支及显式 rem2rpx', (platform) => {
    vi.stubEnv('TARO_ENV', platform)
    expect(resolveGeneratorConfiguration(undefined, { appType: 'taro' }).options.target).toBe('weapp')
    expect(resolveStyleOptionsFromContext({ appType: 'taro', rem2rpx: true } as InternalUserDefinedOptions).rem2rpx).toBe(true)
  })

  it('Hybrid 环境仍允许显式选择小程序 target', () => {
    vi.stubEnv('TARO_ENV', 'harmony-hybrid')
    const ctx = { appType: 'taro', generator: { target: 'weapp' }, rem2rpx: true } as InternalUserDefinedOptions
    expect(resolveGeneratorConfiguration(ctx.generator, { appType: 'taro' }).options.target).toBe('weapp')
    expect(resolveStyleOptionsFromContext(ctx).rem2rpx).toBe(true)
  })

  it('实例保留 Hybrid 环境快照，通用显式 Web 配置继续尊重 rem2rpx', () => {
    vi.stubEnv('TARO_ENV', 'harmony-hybrid')
    const hybrid = getCompilerContext({ appType: 'taro', generator: { target: 'web' }, rem2rpx: true })
    vi.stubEnv('TARO_ENV', undefined)
    expect(resolveStyleOptionsFromContext(hybrid).rem2rpx).toBe(false)
    expect(resolveStyleOptionsFromContext({ generator: { target: 'web' }, rem2rpx: true } as InternalUserDefinedOptions).rem2rpx).toBe(true)
  })

  it.each(['h5', 'harmony-hybrid'])('%s 的工具类、@apply、CSS 和 SCSS 来源在进入 Taro 前具有一致尺寸', async (platform) => {
    vi.stubEnv('TARO_ENV', platform)
    const ctx = getCompilerContext({ appType: 'taro', rem2rpx: true, cssPreflight: false })
    const options = resolveContextGeneratorConfiguration(ctx).options
    const source = await resolveTailwindV4Source({
      css: '@tailwind utilities; .applied { @apply h-[4rem] w-[25rem]; }',
      base: process.cwd(),
    })
    const engine = createTailwindV4Engine(source)
    try {
      const generated = await engine.generate({
        candidates: ['h-[4rem]', 'w-[25rem]'],
        scanSources: false,
        target: options.target,
        webCompat: options.webCompat,
        styleOptions: resolveStyleOptionsFromContext(ctx),
      })
      const dimensions: Record<string, string[]> = {}
      postcss.parse(generated.css).walkDecls(/^(height|width)$/, (declaration) => {
        (dimensions[declaration.prop] ??= []).push(declaration.value)
      })
      expect(dimensions.height).toEqual(['4rem', '4rem'])
      expect(dimensions.width).toEqual(['25rem', '25rem'])
      expectDimensions(generated.css, '.applied')
      const css = await ctx.styleHandler('.source-css { height: 4rem; width: 25rem; }')
      const scss = compileString('$height: 4rem; .source-scss { height: $height; width: 25rem; }').css
      const processedScss = await ctx.styleHandler(scss)
      expectDimensions(css.css, '.source-css')
      expectDimensions(processedScss.css, '.source-scss')
      expect([generated.css, css.css, processedScss.css].join('\n')).not.toContain('rpx')
    }
    finally {
      await engine.dispose?.()
    }
  })
})
