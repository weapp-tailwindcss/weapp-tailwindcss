import type { OutputAsset } from 'rollup'
import type { CssFinalizerContext } from '@/bundlers/vite/css-finalizer/options'
import { describe, expect, it, vi } from 'vitest'
import { finalizeWebCssCalc } from '@/bundlers/vite/css-finalizer/css-calc'

function asset(fileName: string, source: string): OutputAsset {
  return { type: 'asset', fileName, source, names: [], originalFileNames: [] }
}

function context(cssCalc: unknown, sources: string[] = []) {
  return {
    opts: {
      cssCalc,
      cssMatcher: (file: string) => file.endsWith('.css'),
      htmlMatcher: (file: string) => file.endsWith('.html'),
      onUpdate: vi.fn(),
    },
    getViteProcessedCssAssetResults: () => sources.map((css, index) => [`entry-${index}`, { css }]),
    recordCssAssetResult: vi.fn(),
  } as unknown as CssFinalizerContext
}

describe('Vite Web 最终资产的 cssCalc', () => {
  it.each([
    { cssCalc: ['--spacing'] },
    { cssCalc: [/^--spacing$/] },
    { cssCalc: { includeCustomProperties: ['--spacing'] } },
  ])('处理已组装 CSS 中的普通样式：%j', async ({ cssCalc }) => {
    const css = ':root{--spacing: .375rem;--other: 3px}.raw:hover{gap:calc(var(--spacing)*2);width:calc(var(--other)*2)}'
    const output = asset('screen.css', css)
    const html = asset('index.html', `<style>${css}</style>`)
    const ctx = context(cssCalc)
    await finalizeWebCssCalc({ 'screen.css': output, 'index.html': html }, ctx)
    expect(output.source).toContain('gap:0.75rem')
    expect(output.source).toContain(':root')
    expect(output.source).toContain('.raw:hover')
    expect(output.source).toContain('width:calc(var(--other)*2)')
    expect(html.source).toBe(`<style>${css}</style>`)
    expect(ctx.opts.onUpdate).toHaveBeenCalledWith('screen.css', css, output.source)
    expect(ctx.recordCssAssetResult).not.toHaveBeenCalled()
  })

  it('只从当前消费作用域补充跨资产变量，隔离无依赖关系的主题', async () => {
    const output = asset('page.css', '@import "./theme.css";.raw{gap:calc(var(--spacing)*2)}')
    const theme = asset('theme.css', ':root{--spacing:.375rem}')
    const local = asset('local.css', ':root{--spacing:2px}.local{gap:calc(var(--spacing)*2)}')
    const ctx = context(['--spacing'], [':root{--spacing:.375rem}'])
    await finalizeWebCssCalc({ 'page.css': output, 'theme.css': theme, 'local.css': local }, ctx)
    expect(output.source).toContain('gap:0.75rem')
    expect(local.source).toContain('gap:4px')
  })

  it('存在多个不同主题时不猜测缺失变量的来源', async () => {
    const css = '.raw{gap:calc(var(--spacing)*2)}'
    const output = asset('page.css', css)
    const ctx = context(['--spacing'], [':root{--spacing:1rem}', ':root{--spacing:2rem}'])
    await finalizeWebCssCalc({ 'page.css': output }, ctx)
    expect(output.source).toBe(css)
    expect(ctx.opts.onUpdate).not.toHaveBeenCalled()
  })

  it('支持嵌套配置，并允许显式关闭顶层配置', async () => {
    const css = ':root{--spacing:2px}.raw{gap:calc(var(--spacing)*2)}'
    const bundle = { 'page.css': asset('page.css', css) }
    const ctx = context(['--spacing'])
    ctx.opts.cssOptions = { cssCalc: false }
    await finalizeWebCssCalc(bundle, ctx)
    expect(bundle['page.css'].source).toBe(css)
    ctx.opts.cssOptions = { cssCalc: { includeCustomProperties: ['--spacing'] } }
    await finalizeWebCssCalc(bundle, ctx)
    expect(bundle['page.css'].source).toContain('gap:4px')
  })

  it('支持 bundler 的 UTF-8 字节资产', async () => {
    const output = asset('page.css', '')
    output.source = new TextEncoder().encode(':root{--spacing:2px}.按钮{gap:calc(var(--spacing)*2)}')
    await finalizeWebCssCalc({ 'page.css': output }, context(['--spacing']))
    expect(output.source).toContain('.按钮{gap:4px}')
  })
})
