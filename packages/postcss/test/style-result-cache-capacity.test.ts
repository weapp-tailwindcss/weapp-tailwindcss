import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'

vi.mock('lru-cache', async () => {
  const actual = await vi.importActual<typeof import('lru-cache')>('lru-cache')
  return {
    ...actual,
    LRUCache: function (options: ConstructorParameters<typeof actual.LRUCache>[0]) {
      // 只缩小结果缓存预算，保留真实 LRU 和生产容量计算，不创建十万节点的夹具。
      return new actual.LRUCache({ ...options, maxSize: options.maxSize === 128_000 ? 12 : options.maxSize })
    },
  }
})

const { createStyleHandler } = await import('../src/handler')

describe('样式结果缓存按实际保留的树计量', () => {
  it('文本输入的输出 AST 消耗预算，并按最近访问淘汰旧结果', async () => {
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({ cssPreflight: false, onDiagnostic })
    const source = (name: string) => `.${name}{color:red;width:1px}`
    const first = await handler(source('hot'))
    await handler(source('hot'))
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    for (const name of ['cold', 'third', 'hot', 'fourth']) {
      await handler(source(name))
    }
    expect((await handler(source('hot'))).css).toBe(first.css)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    const result = await handler(source('cold'))
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    expect(result.css).toBe((await createStyleHandler({ cssPreflight: false })(source('cold'))).css)
  })

  it('Root 输入同时计入来源快照与输出 AST，淘汰后仍绑定本轮来源', async () => {
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({ cssPreflight: false, onDiagnostic })
    const source = '.first{color:red;width:1px}'
    const parse = (css: string) => postcss.parse(css, { from: 'fixture.css' })
    const first = await handler.transformRoot!(parse(source))
    await handler.transformRoot!(parse(source))
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    await handler.transformRoot!(parse('.second{color:blue;width:2px}'))
    const input = parse(source)
    const result = await handler.transformRoot!(input)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    expect(result.css).toBe(first.css)
    expect(result.root.source?.input).toBe(input.source?.input)
    expect(result.root.first?.source?.input).toBe(input.first?.source?.input)
    expect(result.root).not.toBe(first.root)
  })
})
