import { describe, expect, it, vi } from 'vitest'
import { createStyleHandler } from '@/handler'
import { postcss } from '@/index'

describe('样式处理器的显式 undefined 对象字段', () => {
  it('作者首节点无 before 字段时仍保留输出原有的显式 undefined', async () => {
    const first = postcss.comment({ text: 'header' })
    const root = postcss.root({ nodes: [first, postcss.atRule({
      name: 'layer',
      params: 'utilities',
      raws: { before: '\n' },
      nodes: [postcss.rule({ selector: '.a', raws: { before: '  ' }, nodes: [postcss.decl({ prop: 'color', value: 'red' })] })],
    })] })
    const handler = createStyleHandler({ cssPreflight: false, postcssOptions: { plugins: [{
      postcssPlugin: 'remove-header',
      Comment(comment) { comment.remove() },
    }] } })
    expect(Object.hasOwn(first.raws, 'before')).toBe(false)
    const result = await handler.transformRoot(root)

    expect(result.root.first?.raws.before).toBeUndefined()
    expect(Object.hasOwn(result.root.first?.raws ?? {}, 'before')).toBe(true)
    expect(result.css).toBe('.a {\n    color: red\n}')
    expect(root.first).toBe(first)
    expect(Object.hasOwn(first.raws, 'before')).toBe(false)
  })

  it('非 Error 作者异常的诊断保留 own name 字段及原始拒绝值', async () => {
    const failures: unknown[] = []
    const handler = createStyleHandler({
      onDiagnostic(event) { failures.push(event.error) },
      postcssOptions: { plugins: [{ postcssPlugin: 'reject-author', Once: vi.fn().mockRejectedValue('author failure') }] },
    })
    await expect(handler('.a{color:red}')).rejects.toBe('author failure')
    expect(failures).toStrictEqual([{ name: undefined, message: 'author failure' }])
  })
})
