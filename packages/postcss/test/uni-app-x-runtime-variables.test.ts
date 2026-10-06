import type { IStyleHandlerOptions } from '../src/types'
import postcss from 'postcss'
import { createStyleHandler } from '../src/handler'

const theme = ':root{--text-xs:24rpx;--text-xs--line-height:calc(1 / 0.75)}'
const lineHeight = 'var(--tw-leading,var(--text-xs--line-height))'
const utility = `.wtu-text-xs{font-size:var(--text-xs);line-height:${lineHeight}}`

function createHandler(options: Partial<IStyleHandlerOptions> = {}) {
  return createStyleHandler({
    appType: 'uni-app-x',
    uniAppX: false,
    majorVersion: 4,
    isMainChunk: false,
    cssPresetEnv: { features: { 'custom-properties': { preserve: false } } },
    ...options,
  })
}

function declarations(css: string, selector: string) {
  const values: [string, string, boolean][] = []
  postcss.parse(css).walkRules(selector, (rule) => {
    rule.walkDecls((decl) => {
      values.push([decl.prop, decl.value, Boolean(decl.important)])
    })
  })
  return values
}

describe('uni-app x CSS 运行时变量', () => {
  it.each([
    ['同节点', '.wtu-text-xs{--tw-leading:2}'],
    ['空值', 'view,text{--tw-leading: }'],
    ['条件覆盖', '@media (min-width:1px){.wtu-text-xs{--tw-leading:2}}'],
    ['根默认', ':root{--tw-leading:1.5}'],
    ['初始值', ':root{--tw-leading:initial}'],
  ])('小程序局部类保留%s的动态行高', async (_name, override) => {
    const { css } = await createHandler()(theme + override + utility)
    expect(declarations(css, '.wtu-text-xs')).toContainEqual(['font-size', '24rpx', false])
    expect(declarations(css, '.wtu-text-xs')).toContainEqual(['line-height', lineHeight, false])
    expect(declarations(css, '.wtu-text-xs').filter(([prop]) => prop === 'line-height')).toHaveLength(1)
    const inputSetters: string[] = []
    const outputSetters: string[] = []
    postcss.parse(override).walkDecls('--tw-leading', (decl) => {
      inputSetters.push(decl.value)
    })
    postcss.parse(css).walkDecls('--tw-leading', (decl) => {
      outputSetters.push(decl.value)
    })
    expect(outputSetters).toEqual(inputSetters)
  })

  it.each([false, true])('WebView 保留运行时表达式及优先级，uniAppX=%s', async (uniAppX) => {
    const { css } = await createHandler({ uniAppX })(`${theme}.x{line-height:${lineHeight}!important}`)
    expect(declarations(css, '.x')).toContainEqual(['line-height', lineHeight, true])
  })

  it('保留 calc 内的运行时变量，不丢弃其余单位转换', async () => {
    const { css } = await createHandler({ rem2rpx: true })(
      ':root{--tw-offset:1rem}.x{width:calc(2rem + var(--tw-offset,1rem))}',
    )
    expect(declarations(css, '.x')).toContainEqual(['width', 'calc(64rpx + var(--tw-offset,1rem))', false])
  })

  it('保留间接依赖运行时状态的主题值', async () => {
    const { css } = await createHandler()(':root{--tw-leading:2;--text-custom--line-height:var(--tw-leading,2)}.x{line-height:var(--text-custom--line-height)}')
    expect(declarations(css, '.x')).toContainEqual(['line-height', 'var(--text-custom--line-height)', false])
    const setters: [string, string][] = []
    postcss.parse(css).walkDecls((decl) => {
      if (decl.prop.startsWith('--')) {
        setters.push([decl.prop, decl.value])
      }
    })
    expect(setters).toEqual([
      ['--tw-leading', '2'],
      ['--text-custom--line-height', 'var(--tw-leading,2)'],
    ])
  })

  it.each([
    [String.raw`.x{line-height:var(--\74w-leading,2)}`, String.raw`var(--\74w-leading,2)`],
    [String.raw`:root{--\74 ext-leading:var(--tw-leading,2)}.x{line-height:var(--text-leading,3)}`, 'var(--text-leading,3)'],
    [String.raw`:root{--text-leading:v\61 r(--tw-leading,2)}.x{line-height:var(--text-leading)}`, 'var(--text-leading)'],
    [String.raw`:root{--text-leading:var(--\74w-leading,2)}.x{line-height:var(--text-leading)}`, 'var(--text-leading)'],
    [String.raw`:root{--text-leading:var(--\74 w-leading,2)}.local{--text-leading:3}.x{line-height:var(--text-leading)}`, 'var(--text-leading)'],
  ])('按 CSS 转义身份保留动态依赖：%s', async (source, expected) => {
    const { css } = await createHandler()(source)
    expect(declarations(css, '.x')).toContainEqual(['line-height', expected, false])
  })

  it('条件声明中的多级别名与环不能把运行时变量变成固定主题', async () => {
    const { css } = await createHandler()(':root{--text-a:1;--text-b:var(--text-a)}@media(min-width:1px){.x{--text-a:var(--text-b,var(--tw-leading,2))}}.x{line-height:var(--text-b)}')
    expect(declarations(css, '.x')).toContainEqual(['line-height', 'var(--text-b)', false])
  })

  it('每次处理重新建立变量依赖，不把前一个样式的状态带入缓存', async () => {
    const handler = createHandler()
    const runtimeCss = ':root{--text-custom:var(--tw-leading,2)}.x{line-height:var(--text-custom)}'
    const dynamic = await handler(runtimeCss)
    const fixed = await handler(':root{--text-custom:2}.x{line-height:var(--text-custom)}')
    const cached = await handler(runtimeCss)
    expect(declarations(dynamic.css, '.x')).toContainEqual(['line-height', 'var(--text-custom)', false])
    expect(declarations(fixed.css, '.x')).toContainEqual(['line-height', '2', false])
    expect(cached.css).toBe(dynamic.css)
  })

  it('作者插件新增的运行时引用也经过变量保护', async () => {
    const { css } = await createHandler({
      postcssOptions: {
        plugins: [{
          postcssPlugin: 'add-runtime-leading',
          Once(root) {
            root.append('.x{line-height:var(--tw-leading,2)}')
          },
        }],
      },
    })('.author{color:red}')
    expect(declarations(css, '.x')).toContainEqual(['line-height', 'var(--tw-leading,2)', false])
  })

  it('不改变独立 uniAppX 标志的历史静态处理', async () => {
    const { css } = await createHandler({ appType: undefined, uniAppX: true })(theme + utility)
    expect(declarations(css, '.wtu-text-xs')).toEqual([
      ['font-size', '24rpx', false],
      ['line-height', 'calc(1 / 0.75)', false],
    ])
  })

  it('保持原生 UVUE 的静态主题降级契约', async () => {
    const { css } = await createHandler({ uniAppX: true, uniAppXCssTarget: 'uvue' })(theme + utility)
    expect(declarations(css, '.wtu-text-xs')).toEqual([
      ['font-size', '24rpx', false],
      ['line-height', '1.33333', false],
    ])
  })
})
