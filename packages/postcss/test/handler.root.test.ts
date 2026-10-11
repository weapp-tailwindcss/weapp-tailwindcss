import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createStyleHandler, postcss } from '@/index'

describe('style handler root api', () => {
  it('相同打印结果但 AST 字段或扩展元数据变化时不能复用旧 Root', async () => {
    const handler = createStyleHandler({ cssPreflight: false })
    const first = postcss.parse('.a{color:red}')
    Object.assign(first, { sourceRevision: 1 })
    await handler.transformRoot(first)
    const second = first.clone()
    Object.assign(second, { sourceRevision: 2 })
    const result = await handler.transformRoot(second)
    expect((result.root as typeof first & { sourceRevision: number }).sourceRevision).toBe(2)
  })
  it('匿名 Root 缓存命中后绑定本次输入，而不是沿用旧的随机来源', async () => {
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({ cssPreflight: false, onDiagnostic })
    await handler.transformRoot(postcss.parse('.a{color:red}'))
    const current = postcss.parse('.a{color:red}')
    const result = await handler.transformRoot(current)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    expect(result.root.first?.source?.input).toBe(current.first?.source?.input)
  })
  it('复用等价 Root，但来源位置变化必须保留本轮归属', async () => {
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({ cssPreflight: false, onDiagnostic })
    const css = '.box { color: red; }'
    const first = await handler.transformRoot(postcss.parse(css, { from: 'first.css' }))
    const second = await handler.transformRoot(postcss.parse(css, { from: 'first.css' }))
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    expect(second.root).not.toBe(first.root)
    const third = await handler.transformRoot(postcss.parse(css, { from: 'second.css' }))
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    expect(third.root.first?.source?.input.file).toBe(path.resolve('second.css'))
    const moved = postcss.parse(css, { from: 'second.css' })
    moved.first!.source!.start!.line = 99
    const fourth = await handler.transformRoot(moved)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    expect(fourth.root.first?.source?.start?.line).toBe(99)
  })
  it('rejects a plugin replacing a single root with a document', async () => {
    const handler = createStyleHandler({
      postcssOptions: {
        plugins: [{
          postcssPlugin: 'replace-with-document',
          OnceExit(_root, { result }) {
            result.root = postcss.document({ nodes: [postcss.root()] })
          },
        }],
      },
    })
    await expect(handler.transformRoot(postcss.parse('.box { color: red }')))
      .rejects.toThrow('single PostCSS Root')
  })

  it('does not mutate the input root', async () => {
    const handler = createStyleHandler({
      cssOptions: {
        px2rpx: true,
      },
    })
    const root = postcss.parse('.box { width: 10px; }')

    const result = await handler.transformRoot(root)

    expect(root.toString()).toBe('.box { width: 10px; }')
    expect(result.css).toContain('10rpx')
  })

  it('returns independent roots for cached results', async () => {
    const handler = createStyleHandler()
    const root = postcss.parse('.box { color: red; }')

    const first = await handler.transformRoot(root)
    first.root.append({
      selector: '.mutated',
      nodes: [],
    })
    const second = await handler.transformRoot(root)

    expect(second.css).not.toContain('.mutated')
    expect(second.root).not.toBe(first.root)
  })
})
