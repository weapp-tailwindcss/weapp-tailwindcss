import type { OutputAsset } from 'rollup'
import type { CssFinalizerContext } from '@/bundlers/vite/css-finalizer/options'
import { expect, it, vi } from 'vitest'
import { finalizeWebCssAssets } from '@/bundlers/vite/css-finalizer/web-assets'
import { canAppendGeneratorCss, finalizeIncrementalGeneratorCss, finalizeWebGeneratorCss } from '@/generation/result-helpers'

const registration = '@property --tw-space-y-reverse { syntax: "*"; inherits: false; initial-value: 0; }'
const reverse = ':where(.space-y-reverse > :not(:last-child)) { --tw-space-y-reverse: 1; }'

it('构建片段延迟注册默认值，而独立入口保持即时默认值', () => {
  const css = `${registration}\n.probe { color: red; }`
  expect(finalizeWebGeneratorCss(css, 'web', true, true)).not.toContain('*, ::before')
  expect(finalizeWebGeneratorCss(css, 'web', true)).toContain('*, ::before')
})

it('HMR 在完整前后文上合成默认值，不能向旧 utility 后面追加 reset', () => {
  const previous = finalizeWebGeneratorCss(`${registration}\n${reverse}`, 'web', true)
  const result = finalizeIncrementalGeneratorCss(previous, `${registration}\n.probe { color: red; }`, 'web', 4, false, {}, true)
  expect(result.match(/\*, ::before, ::after, ::backdrop/g)).toHaveLength(1)
  expect(result.lastIndexOf('--tw-space-y-reverse: 0')).toBeLessThan(result.indexOf(reverse))
})

it('注册兼容开启时不拼接已收尾的旧 CSS，关闭时保留原增量路径', () => {
  expect(canAppendGeneratorCss('web', true)).toBe(false)
  expect(canAppendGeneratorCss('web', { features: { property: false } })).toBe(true)
  expect(canAppendGeneratorCss('weapp', true)).toBe(true)
})

function context() {
  return {
    opts: {
      generator: { target: 'web', webCompat: true },
      cssCalc: false,
      cssMatcher: (file: string) => file.endsWith('.css'),
      htmlMatcher: () => false,
      onUpdate: vi.fn(),
    },
    runtimeState: { tailwindRuntime: { majorVersion: 4 } },
    getResolvedConfig: () => ({ build: { outDir: 'web' } }),
  } as unknown as CssFinalizerContext
}

function asset(fileName: string, source: string): OutputAsset {
  return { type: 'asset', fileName, source, names: [], originalFileNames: [], needsCodeReference: false, name: undefined, originalFileName: undefined }
}

it('完整资产组装后仅在 utility 前合成，保留作者同签名 reset 原位', async () => {
  const author = '*, ::before, ::after, ::backdrop { --tw-space-y-reverse: 0; }'
  const bundle = { 'scope.css': asset('scope.css', `${registration}\n${reverse}\n${registration}\n.author{}\n${author}`) }
  await finalizeWebCssAssets(bundle, context())
  const css = String(bundle['scope.css'].source)
  expect(css.match(/\*, ::before, ::after, ::backdrop/g)).toHaveLength(2)
  expect(css.indexOf('--tw-space-y-reverse: 0')).toBeLessThan(css.indexOf(reverse))
  expect(css.lastIndexOf(author)).toBeGreaterThan(css.indexOf(reverse))
})

it('watch 新增和删除跨资产冲突注册时撤销并恢复本轮合成，不污染生成缓存', async () => {
  const ctx = context()
  const original = registration + reverse
  const bundle = { 'scope.css': asset('scope.css', original), 'author.css': asset('author.css', '.author{color:red}') }
  await finalizeWebCssAssets(bundle, ctx)
  expect(String(bundle['scope.css'].source)).toContain('*, ::before')
  bundle['author.css'].source = registration.replace('initial-value: 0', 'initial-value: 2')
  await finalizeWebCssAssets(bundle, ctx)
  expect(bundle['scope.css'].source).toBe(original)
  bundle['author.css'].source = '.author{color:red}'
  await finalizeWebCssAssets(bundle, ctx)
  expect(String(bundle['scope.css'].source).match(/\*, ::before, ::after, ::backdrop/g)).toHaveLength(1)
})
