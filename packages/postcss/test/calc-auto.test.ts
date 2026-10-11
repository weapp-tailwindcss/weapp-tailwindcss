import type { IStyleHandlerOptions } from '@/types'
import { applyConfiguredCssCalc } from '@/plugins/applyConfiguredCssCalc'
import { createStyleHandler } from '@/handler'

const options = {
  cssCalc: 'auto',
  majorVersion: 4,
  platform: 'mp-weixin',
  cssCalcContextComplete: true,
} as Partial<IStyleHandlerOptions>

describe('微信 rpx 自动计算', () => {
  it.each(['1', '2', '3', '8', '0.5', '-0.5'])('完整作用域的固定 %srpx 主题默认静态化', async (base) => {
    const css = await applyConfiguredCssCalc(`:root{--spacing:${base}rpx}.w{width:calc(var(--spacing)*32)}`, options)
    expect(css).toContain(`width:${Number(base) * 32}rpx`)
    expect(css).not.toContain('width:calc(')
  })

  it('仅处理 rpx calc，保留其他表达式、普通变量和字符串', async () => {
    const css = await applyConfiguredCssCalc(':root{--base:1rpx;--spacing:calc(var(--base)*2);--px:2px}.w{width:calc(var(--spacing)*32);padding:var(--spacing);height:calc(2px*4);margin:calc(var(--px)*4);gap:calc(3rpx*4);content:"calc(1rpx*2)";transform:translate(calc(2px*4),calc(3rpx*4))}', options)
    expect(css).toContain('width:64rpx')
    expect(css).toContain('padding:var(--spacing)')
    expect(css).toContain('height:calc(2px*4)')
    expect(css).toContain('margin:calc(var(--px)*4)')
    expect(css).toContain('gap:12rpx')
    expect(css).toContain('content:"calc(1rpx*2)"')
    expect(css).toContain('translate(calc(2px*4),12rpx)')
  })

  it.each([
    '.scope{--spacing:2rpx}',
    '@media(min-width:1px){:root{--spacing:2rpx}}',
    ':root{--spacing:2rpx}',
    '@property --spacing{syntax:"<length>";inherits:false;initial-value:1rpx}',
  ])('已知覆盖不冻结：%s', async (override) => {
    const css = await applyConfiguredCssCalc(`:root{--spacing:1rpx}${override}.w{width:calc(var(--spacing)*32)}`, options)
    expect(css).toContain('width:calc(var(--spacing)*32)')
  })

  it('没有完整上下文的适配器只处理字面量', async () => {
    const css = await applyConfiguredCssCalc(':root{--spacing:1rpx}.w{width:calc(var(--spacing)*32);height:calc(1rpx*32)}', {
      ...options, cssCalcContextComplete: false,
    } as Partial<IStyleHandlerOptions>)
    expect(css).toContain('width:calc(var(--spacing)*32)')
    expect(css).toContain('height:32rpx')
  })

  it.each(['h5', 'app-android', 'mp-alipay', undefined])('其他或未知平台不启用：%s', async (platform) => {
    const source = ':root{--spacing:1rpx}.w{width:calc(var(--spacing)*32);height:calc(1rpx*32)}'
    expect(await applyConfiguredCssCalc(source, { ...options, platform })).toBe(source)
  })

  it('显式关闭和 v3 不启用', async () => {
    const source = '.w{width:calc(1rpx*32)}'
    expect(await applyConfiguredCssCalc(source, { ...options, cssCalc: false })).toBe(source)
    expect(await applyConfiguredCssCalc(source, { ...options, majorVersion: undefined })).toBe(source)
  })

  it('不选择数值标量变量，也不截断精细的小数长度', async () => {
    const css = await applyConfiguredCssCalc(':root{--scale:2;--spacing:0.000001rpx}.w{width:calc(var(--scale)*3rpx);height:calc(var(--spacing)*32)}', options)
    expect(css).toContain('width:calc(var(--scale)*3rpx)')
    expect(css).toContain('height:0.000032rpx')
  })

  it.each([
    ':root{--spacing:var(--unknown,1rpx)}',
    ':root{--spacing:var(--base);--base:var(--spacing)}',
    ':root{--spacing:var(--base);--base:1rpx}.scope{--base:2rpx}',
    ':root{--spacing:1rpx}.scope{--spa\\63 ing:2rpx}',
    ':root{--spacing:inherit}',
  ])('未知依赖及等价转义覆盖保留原式：%s', async (theme) => {
    const css = await applyConfiguredCssCalc(`${theme}.w{width:calc(var(--spacing,8rpx)*32)}`, options)
    expect(css).toContain('width:calc(var(--spacing,8rpx)*32)')
  })

  it('安全转义别名和大小写敏感名称参与相同分析', async () => {
    const css = await applyConfiguredCssCalc(':root{--spacing:1rpx;--Spacing:2rpx}.w{width:calc(var(--spa\\63 ing)*32);height:calc(var(--Spacing)*32)}', options)
    expect(css).toContain('width:32rpx')
    expect(css).toContain('height:64rpx')
  })

  it('完整上下文、模式和主题变化进入处理器缓存', async () => {
    const handler = createStyleHandler(options)
    const source = '.w{width:calc(var(--spacing)*32)}'
    const context = ':root{--spacing:1rpx}'
    expect((await handler(source, { customPropertyContextCss: context })).css).toContain('width:32rpx')
    expect((await handler(source, { customPropertyContextCss: context, cssCalcContextComplete: false })).css).toContain('var(--spacing)')
    expect((await handler(source, { customPropertyContextCss: context, cssCalc: false })).css).toContain('var(--spacing)')
    expect((await handler(source, { customPropertyContextCss: ':root{--spacing:2rpx}' })).css).toContain('width:64rpx')
    expect((await handler(source, { customPropertyContextCss: `${context}.scope{--spacing:2rpx}` })).css).toContain('var(--spacing)')
  })

  it('作者插件完成后再判断覆盖，显式 Map 不绕过自动推导', async () => {
    const handler = createStyleHandler({
      ...options,
      customPropertyValues: new Map([['--spacing', '8rpx']]),
      postcssOptions: { plugins: [{
        postcssPlugin: 'author-test',
        OnceExit(root) { root.append('.scope{--spacing:2rpx}') },
      }] },
    })
    expect((await handler(':root{--spacing:1rpx}.w{width:calc(var(--spacing)*32)}')).css).toContain('var(--spacing)')
  })
})
