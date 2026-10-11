import { describe, expect, it } from 'vitest'
import { createStyleHandler } from '@/handler'

describe('用户阶段删除首节点后的空白归属', () => {
  it('移除 banner 后提升 layer 不重新带回内部缩进', async () => {
    const handler = createStyleHandler({ cssPreflight: false, postcssOptions: { plugins: [{
      postcssPlugin: 'remove-banner',
      Comment(comment) { comment.remove() },
    }] } })
    const css = '/* header */\n@layer theme {\n  .theme { color: red }\n}'
    expect((await handler(css)).css).toBe('.theme { color: red }')
    expect((await handler(css)).css).toBe('.theme { color: red }')
    expect((await handler('\n@layer theme {\n  .theme { color: red }\n}')).css).toBe('\n  .theme { color: red }')
  })
})
