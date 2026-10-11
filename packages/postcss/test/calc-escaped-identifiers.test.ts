import type { IStyleHandlerOptions } from '@/types'
import { createStyleHandler } from '@/handler'
import { applyConfiguredCssCalc } from '@/plugins/applyConfiguredCssCalc'

const options = { cssCalc: ['--spacing'] }
const utility = '.w-32 { width: calc(var(--spacing) * 32) }'
const entries = [
  ['eager', async (css: string, extra: Partial<IStyleHandlerOptions> = {}) => (await createStyleHandler({ ...options, ...extra })(css)).css],
  ['deferred', (css: string, extra: Partial<IStyleHandlerOptions> = {}) => applyConfiguredCssCalc(css, { ...options, ...extra })],
] as const
const spellings = [String.raw`--\73pacing`, String.raw`--s\70 acing`, String.raw`--\000073pacing`, String.raw`--\spacing`, String.raw`\2d -spacing`]

describe.each(entries)('%s calc 的 CSS 标识符身份', (_, transform) => {
  it.each(spellings)('阻止同名转义声明 %s 的动态覆盖被静态化', async (name) => {
    const css = await transform(`:root { --spacing: 1rpx } @media (min-width: 500px) { :root { ${name}: 2rpx } } ${utility}`, {
      customPropertyValues: new Map([['--spacing', '1rpx']]),
    })
    expect(css).toContain('var(--spacing)')
    expect(css).not.toMatch(/width:\s*32rpx/)
  })

  it.each(spellings)('固定声明、变量引用与白名单使用同一身份：%s', async (name) => {
    const declared = await transform(`:root { ${name}: 1rpx } ${utility}`)
    expect(declared).toMatch(/width:\s*32rpx/)
    const referenced = await transform(`:root { --spacing: 1rpx } .x { width: calc(var(${name}) * 32) }`)
    expect(referenced).toMatch(/width:\s*32rpx/)
    const selected = await transform(`:root { --spacing: 1rpx } ${utility}`, { cssCalc: [name] })
    expect(selected).toMatch(/width:\s*32rpx/)
  })

  it('正则白名单匹配解码后的大小写敏感身份', async () => {
    const css = await transform(String.raw`:root { --\73pacing: 1rpx } .x { width: calc(var(--s\70 acing) * 32) }`, { cssCalc: [/^--spacing$/] })
    expect(css).toMatch(/width:\s*32rpx/)
  })

  it('忽略全局粘连正则的 lastIndex，且不修改调用方正则', async () => {
    const include = /^--spacing$/gy
    include.lastIndex = 99
    const source = String.raw`:root { --\73pacing: 1rpx } .x { width: calc(var(--s\70 acing) * 32) }`
    expect(await transform(source, { cssCalc: [include] })).toMatch(/width:\s*32rpx/)
    expect(await transform(source, { cssCalc: [include] })).toMatch(/width:\s*32rpx/)
    expect(include.lastIndex).toBe(99)
  })

  it('解码显式 Map 的名称，并阻止转义的同名覆盖', async () => {
    for (const nested of [false, true]) {
      const values = new Map([[String.raw`--\73pacing`, '2rpx']])
      const extra = nested
        ? { cssOptions: { cssCalc: { includeCustomProperties: [String.raw`--s\70 acing`], customPropertyValues: values } } }
        : { customPropertyValues: values }
      expect(await transform(utility, extra)).toMatch(/width:\s*64rpx/)
      const dynamic = await transform(`.compact { --spacing: 3rpx } ${utility}`, extra)
      expect(dynamic).toContain('var(--spacing)')
      expect(dynamic).not.toMatch(/width:\s*64rpx/)
    }
  })

  it('转义的变量依赖不能绕过显式值安全检查', async () => {
    const css = await transform(String.raw`:root { --spacing: var(--\62 ase); --base: 1rpx } @media (min-width: 500px) { :root { --base: 2rpx } } .x { width: calc(var(--spacing) * 32) }`, {
      customPropertyValues: new Map([['--spacing', '1rpx']]),
    })
    expect(css).toContain('width: calc(var(--spacing)')
  })

  it('固定的转义别名链可以静态化', async () => {
    const css = await transform(String.raw`:root { --spacing: var(--\62 ase); --base: 1rpx } .x { width: calc(var(--spacing) * 32) }`)
    expect(css).toMatch(/width:\s*32rpx/)
  })

  it('识别转义的 @property 注册', async () => {
    const css = await transform(String.raw`@property --\73pacing { syntax: "<length>"; inherits: false; initial-value: 1rpx } :root { --spacing: 1rpx } .x { width: calc(var(--spacing) * 32) }`)
    expect(css).toContain('width: calc(var(--spacing)')
  })

  it('转义的注册关键字和继承值仍限制显式常量', async () => {
    for (const source of [
      String.raw`@pro\70 erty --spacing { syntax: "<length>"; inherits: false; initial-value: 1rpx } :root { --spacing: 1rpx }`,
      String.raw`:root { --spacing: \69 nherit }`,
    ]) {
      const css = await transform(`${source} ${utility}`, { customPropertyValues: new Map([['--spacing', '1rpx']]) })
      expect(css).toContain('width: calc(var(--spacing)')
    }
  })

  it('解码后仍区分自定义属性的大小写', async () => {
    const css = await transform(String.raw`:root { --spacing: 1rpx } .compact { --\53pacing: 2rpx } .x { width: calc(var(--spacing) * 32) }`)
    expect(css).toMatch(/width:\s*32rpx/)
    expect(await transform(`:root { --spacing: 1rpx } ${utility}`, { cssCalc: [String.raw`--\53pacing`] })).toContain('var(--spacing)')
    expect(await transform(utility, { customPropertyValues: new Map([['--Spacing', '2rpx']]) })).toContain('var(--spacing)')
  })

  it('解码后的反斜杠字面值不能冒充另一变量的原始引用拼写', async () => {
    const css = await transform(String.raw`:root { --spacing: 1rpx; --\\spacing: 5rpx } .compact { --spacing: 2rpx } .x { width: calc(var(--\spacing) * 32) }`, { cssCalc: true })
    expect(css).toContain(String.raw`var(--\spacing)`)
    expect(css).not.toMatch(/width:\s*(?:32|160)rpx/)
  })
})
