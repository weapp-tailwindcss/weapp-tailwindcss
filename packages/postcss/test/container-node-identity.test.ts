import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { pruneMiniProgramGeneratedCssRoot } from '../src/compat/mini-program-css/prune-generated'
import { withPreservedRegistrationScopes } from '../src/compat/web-css-registration-scopes'
import { createPresetEnvPlugin } from '../src/plugins/preset-env'

describe('CSS 容器与原节点身份边界', () => {
  it.each([false, true])('注册恢复停在所属 Root，异常=%s', (throws) => {
    const input = '@media print{@supports (display:grid){@property --author{syntax:"*";inherits:false;initial-value:0}}}'
    const root = postcss.parse(input)
    const sibling = postcss.parse('.sibling{color:blue}')
    const siblingRule = sibling.first
    const document = postcss.document({ nodes: [root, sibling] })
    const error = new Error('author transform failed')
    const transform = () => withPreservedRegistrationScopes(root, () => {
      if (throws) {
        throw error
      }
    })

    if (throws) {
      expect(transform).toThrow(error)
    }
    else {
      transform()
    }

    expect(root.toString()).toBe(input)
    expect(root.parent).toBe(document)
    expect(document.nodes).toHaveLength(2)
    expect(document.nodes[0]).toBe(root)
    expect(document.nodes[1]).toBe(sibling)
    expect(sibling.first).toBe(siblingRule)
    expect(sibling.toString()).toBe('.sibling{color:blue}')
  })

  it('裁剪遍历可到达 Document，保留本 Root 的 class 祖先与关键帧', () => {
    const root = postcss.parse('.raw{article{color:red}}@keyframes spin{from{opacity:0}to{opacity:1}}')
    const rule = root.first
    const keyframes = root.last
    const sibling = postcss.parse('article{color:blue}')
    const document = postcss.document({ nodes: [root, sibling] })

    expect(pruneMiniProgramGeneratedCssRoot(root, { preserveRawClassRules: true })).toBe(root)
    expect(root.first).toBe(rule)
    expect(root.last).toBe(keyframes)
    expect(root.toString()).toBe('.raw{article{color:red}}@keyframes spin{from{opacity:0}to{opacity:1}}')
    expect(root.parent).toBe(document)
    expect(sibling.toString()).toBe('article{color:blue}')
  })

  it.each([false, true])('真实 preset-env 重访同一 AST 时不重复回退，preserve=%s', async (preserve) => {
    const root = postcss.parse('.x{color:var(--author);color:#1234!important}')
    const processor = postcss([createPresetEnvPlugin({
      browsers: ['IE 11'],
      autoprefixer: false,
      preserve,
    })])
    const expected = `.x{color:var(--author);color:rgba(17,34,51,0.26667)!important${preserve ? ';color:#1234!important' : ''}}`

    const first = await processor.process(root, { from: undefined })
    expect(first.root).toBe(root)
    expect(first.css).toBe(expected)
    const declarations: postcss.Declaration[] = []
    root.walkDecls((declaration) => {
      declarations.push(declaration)
    })
    const second = await processor.process(root, { from: undefined })
    expect(second.root).toBe(root)
    expect(second.css).toBe(expected)
    const revisited: postcss.Declaration[] = []
    root.walkDecls((declaration) => {
      revisited.push(declaration)
    })
    expect(revisited).toHaveLength(declarations.length)
    revisited.forEach((declaration, index) => {
      expect(declaration).toBe(declarations[index])
    })
  })
})
