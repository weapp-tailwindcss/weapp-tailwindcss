import postcss from 'postcss'
import { dedupeDeclarations } from '@/plugins/post/decl-dedupe'

describe('声明去重的物理属性与优先级边界', () => {
  it.each([
    '.x{margin-inline-start:1px;color:red;margin-left:1px}',
    '.x{margin-left:1px;color:red;margin-inline-start:1px}',
  ])('跨普通属性时仍优先保留物理属性：%s', (source) => {
    const root = postcss.parse(source)
    root.walkRules(dedupeDeclarations)
    expect(root.toString()).toContain('margin-left:1px')
    expect(root.toString()).not.toContain('margin-inline-start')
  })

  it('不同 important 级别的物理声明分别保留', () => {
    const root = postcss.parse('.x{margin-left:1px;color:red;margin-left:2px!important}')
    root.walkRules(dedupeDeclarations)
    expect(root.toString()).toBe('.x{margin-left:1px;color:red;margin-left:2px!important}')
  })
})
