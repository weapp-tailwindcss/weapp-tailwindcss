import type { OutputAsset, OutputChunk } from 'rollup'
import type { CssFinalizerContext } from '@/bundlers/vite/css-finalizer/options'
import type { InternalUserDefinedOptions } from '@/types'
import { createStyleHandler } from '@weapp-tailwindcss/postcss/transform'
import { createViteCssCalcStage } from '@/bundlers/vite/css-calc-stage'
import { finalizeCssCalc } from '@/bundlers/vite/css-finalizer/css-calc'
import { getCompilerContext } from '@/context'
import { resolveStyleOptionsFromContext } from '@/context/style-options'

function asset(fileName: string, source: string): OutputAsset {
  return { type: 'asset', fileName, source, names: [], originalFileNames: [] }
}

function fixture(cssCalc?: InternalUserDefinedOptions['cssCalc']) {
  const original = {
    cssCalc, platform: 'mp-weixin', appType: 'uni-app', rem2rpx: false,
    tailwindRuntime: { majorVersion: 4 }, generator: { target: 'weapp' },
    cssMatcher: (file: string) => file.endsWith('.css'), htmlMatcher: () => false,
    onUpdate: vi.fn(), styleHandler: createStyleHandler(),
  } as unknown as InternalUserDefinedOptions
  const stage = createViteCssCalcStage(original, () => true)
  const context = { opts: stage.options, getFinalCssCalcOptions: stage.getFinalOptions } as CssFinalizerContext
  return { original, stage, context }
}

it('未配置和显式 false 在平台尚未确定时仍可区分', () => {
  expect(getCompilerContext({ logLevel: 'silent' }).cssCalc).toBeUndefined()
  expect(getCompilerContext({ cssCalc: false, logLevel: 'silent' }).cssCalc).toBe(false)
})

it('默认微信模式延后到完整产物图，watch 根据作者覆盖重新计算', async () => {
  const { stage, context } = fixture()
  expect(stage.shouldDefer()).toBe(true)
  expect(stage.getFinalOptions()?.cssCalc).toBe('auto')
  const bundle = {
    'entry.css': asset('entry.css', '@import "./theme.css";@import "./author.css";'),
    'theme.css': asset('theme.css', 'page{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}'),
    'author.css': asset('author.css', '.scope{color:red}'),
  }
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toContain('width:32rpx')
  bundle['author.css'].source = '.scope{--spacing:2rpx}'
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toContain('width:calc(var(--spacing)*32)')
  bundle['author.css'].source = '.scope{color:red}'
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toContain('width:32rpx')
})

it('显式 false 关闭默认适配', async () => {
  const { stage, context } = fixture(false)
  expect(stage.shouldDefer()).toBe(false)
  const source = 'page{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}'
  const bundle = { 'theme.css': asset('theme.css', source) }
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toBe(source)
})

it('watch 切换自动、关闭及显式模式时不遗留静态资产', async () => {
  const { original, context } = fixture()
  const source = 'page{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}'
  const bundle = { 'theme.css': asset('theme.css', source) }
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toContain('width:32rpx')
  original.cssCalc = false
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toBe(source)
  original.cssCalc = true
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toContain('width:32rpx')
  original.cssCalc = 'auto'
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toContain('width:32rpx')
})

it('复用最终产物时，单位配置原位改变仍重新计算', async () => {
  const { original, context } = fixture()
  const rule = { from: 'rpx', to: 'px', factor: 0.5 }
  original.unitConversion = { rules: [rule] }
  const bundle = { 'theme.css': asset('theme.css', 'page{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}') }
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toContain('width:16px')
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toContain('width:16px')
  rule.factor = 0.25
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toContain('width:8px')
})

it('宿主加载的独立样式也阻止自动冻结，不依赖输出名称', async () => {
  const { context } = fixture()
  const bundle = {
    'renamed.css': asset('renamed.css', 'page{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}'),
    'other/component.css': asset('other/component.css', '.scope{--spacing:3rpx}'),
  }
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['renamed.css'].source).toContain('width:calc(var(--spacing)*32)')
  bundle['other/component.css'].source = '.scope{color:red}'
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['renamed.css'].source).toContain('width:32rpx')
})

it.each(['dir/theme.css', 'dir\\theme.css'])('消费元数据中缺失的资产使自动上下文不完整：%s', async (known) => {
  const { context } = fixture()
  const bundle = {
    'dir/theme.css': asset('dir/theme.css', 'page{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}'),
    'entry.js': {
      type: 'chunk', fileName: 'entry.js', isEntry: true, imports: [],
      viteMetadata: { importedCss: new Set([known, 'missing.css']) },
    } as unknown as OutputChunk,
  }
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['dir/theme.css'].source).toContain('width:calc(var(--spacing)*32)')
})

it.each(['https://example.test/theme.css', './missing.css'])('未知导入 %s 不推断完整上下文', async (request) => {
  const { context } = fixture()
  const bundle = {
    'entry.css': asset('entry.css', `@import "${request}";@import "./theme.css";`),
    'theme.css': asset('theme.css', 'page{--spacing:1rpx}.w{width:calc(var(--spacing)*32);height:calc(1rpx*32)}'),
  }
  await finalizeCssCalc(bundle, context, true)
  expect(bundle['theme.css'].source).toContain('width:calc(var(--spacing)*32)')
  expect(bundle['theme.css'].source).toContain('height:32rpx')
})

it.each(['mp-weixin', 'weapp', 'wx', 'weixin', 'h5', 'app-android', 'mp-alipay', undefined])('默认策略使用明确平台 %s', (platform) => {
  const { original } = fixture()
  original.platform = platform
  const resolved = resolveStyleOptionsFromContext(original, 4)
  expect(resolved.cssCalc).toBe(['mp-weixin', 'weapp', 'wx', 'weixin'].includes(platform ?? '') ? 'auto' : undefined)
  expect(resolveStyleOptionsFromContext(original, 3).cssCalc).toBeUndefined()
})

it.each([false, true, ['--spacing'], { includeCustomProperties: ['--spacing'], preserve: true }, 'auto'] as const)('嵌套显式配置 %j 优先且不被默认策略覆盖', (cssCalc) => {
  const { original } = fixture(true)
  original.cssOptions = { cssCalc: cssCalc as InternalUserDefinedOptions['cssCalc'] }
  expect(resolveStyleOptionsFromContext(original, 4).cssCalc).toEqual(cssCalc)
})
