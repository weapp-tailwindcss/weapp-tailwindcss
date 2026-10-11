import autoprefixer from 'autoprefixer'
import { createStyleHandler } from '@/index'

describe('用户前缀阶段后的透明渐变回退', () => {
  const source = '.nut-skeleton-animation{background:linear-gradient(90deg,#0000,#00000005,#0000)}'

  it('用户前缀处理完成后仍为标准渐变保留 rgba 兼容值', async () => {
    const browsers = ['Safari 4', 'Android >= 4.1', 'ios >= 8']
    const handler = createStyleHandler({
      cssPresetEnv: { browsers },
      postcssOptions: {
        plugins: [autoprefixer({ overrideBrowserslist: browsers })],
      },
    })

    for (let pass = 0; pass < 2; pass++) {
      const { root } = await handler(source)
      const values: string[] = []
      root.walkDecls('background', (declaration) => {
        values.push(declaration.value)
      })
      expect(values).toEqual([
        '-webkit-gradient(linear,left top, right top,from(rgba(0,0,0,0)),color-stop(rgba(0,0,0,0.01961)),to(rgba(0,0,0,0)))',
        '-webkit-linear-gradient(left,rgba(0,0,0,0),rgba(0,0,0,0.01961),rgba(0,0,0,0))',
        'linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,0.01961),rgba(0,0,0,0))',
      ])
    }
  })

  it('没有旧 WebKit 回退时仍为不支持透明十六进制的目标降级', async () => {
    const browsers = ['Chrome 49']
    const handler = createStyleHandler({
      cssPresetEnv: { browsers },
      postcssOptions: {
        plugins: [autoprefixer({ overrideBrowserslist: browsers })],
      },
    })

    const { css } = await handler(source)
    expect(css).toBe('.nut-skeleton-animation{background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,0.01961),rgba(0,0,0,0))}')
  })

  it.each(['var(--author-background)', '-webkit-linear-gradient(left,red,blue)'])('不将前置 %s 视为当前声明的兼容回退', async (fallback) => {
    const handler = createStyleHandler({ cssPresetEnv: { browsers: ['IE 11'], autoprefixer: false } })
    const { css } = await handler(`.x{background:${fallback};background:linear-gradient(90deg,#0000,#00000005)!important}`)
    expect(css).toBe(`.x{background:${fallback};background:linear-gradient(90deg,rgba(0,0,0,0),rgba(0,0,0,0.01961))!important}`)
  })

  it('preserve 保留现代声明且重复处理不会增加兼容声明', async () => {
    const handler = createStyleHandler({ cssPresetEnv: { browsers: ['IE 11'], preserve: true } })
    const input = '.x{color:var(--author-color);color:#1234!important}'
    const result = await handler(input)
    expect(result.css).toBe('.x{color:var(--author-color);color:rgba(17,34,51,0.26667)!important;color:#1234!important}')
    expect((await handler(result.css)).css).toBe(result.css)
  })

  it('不跨过作者的中间覆盖复用旧回退', async () => {
    const handler = createStyleHandler({ cssPresetEnv: { browsers: ['IE 11'], preserve: true } })
    const input = '.x{color:rgba(17,34,51,0.26667);color:red;color:#1234}'
    expect((await handler(input)).css).toBe('.x{color:rgba(17,34,51,0.26667);color:red;color:rgba(17,34,51,0.26667);color:#1234}')
  })

  it('自定义属性的回退匹配区分大小写', async () => {
    const handler = createStyleHandler({ cssPresetEnv: { browsers: ['IE 11'], preserve: true } })
    const input = '.x{--A:rgba(17,34,51,0.26667);--a:#1234}'
    expect((await handler(input)).css).toBe('.x{--A:rgba(17,34,51,0.26667);--a:rgba(17,34,51,0.26667);--a:#1234}')
  })

  it('重复普通声明保留作者最终层叠次序', async () => {
    const handler = createStyleHandler()
    expect((await handler('.x{color:red;color:blue;color:red}')).css).toBe('.x{color:red;color:blue;color:red}')
  })

  it('shorthand 与 important 的中间覆盖不会让最终声明被去重', async () => {
    const handler = createStyleHandler({ cssPresetEnv: { browsers: ['IE 11'] } })
    const input = '.x{background:#1234!important;background-image:linear-gradient(red,blue)!important;background:#1234!important}'
    expect((await handler(input)).css).toBe('.x{background:rgba(17,34,51,0.26667)!important;background-image:linear-gradient(red,blue)!important;background:rgba(17,34,51,0.26667)!important}')
  })

  it.each([
    { browsers: ['Chrome 140'] },
    { browsers: ['IE 11'], features: { 'hexadecimal-alpha-notation': false } },
  ])('遵守现代浏览器与显式关闭配置：%j', async (cssPresetEnv) => {
    const handler = createStyleHandler({ cssPresetEnv })
    const input = '.x{color:var(--author-color);color:#1234}'
    expect((await handler(input)).css).toBe(input)
  })

  it('跳过 URL、字符串与 @property 初值里的十六进制文本', async () => {
    const handler = createStyleHandler({
      cssPresetEnv: { browsers: ['IE 11'] },
      cssRemoveProperty: false,
    })
    const input = '.x{background:red;background:url("#1234");content:"#1234"}@property --x{syntax:"<color>";inherits:false;initial-value:#1234}'
    expect((await handler(input)).css).toBe(input)
  })
})
