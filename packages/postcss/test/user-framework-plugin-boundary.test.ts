import { describe, expect, it, vi } from 'vitest'
import postcss from 'postcss'
import { processFrameworkCss } from '@/framework-pipeline'
import { createStyleHandler } from '@/handler'

describe('作者与框架重放的插件边界', () => {
  it('生成后的 AST 只进入平台转换，不再次应用字符串输入保护', async () => {
    const handler = createStyleHandler({ cssPreflight: false, majorVersion: 4, postcssOptions: { plugins: [{
      postcssPlugin: 'generated-ast',
      Once(root) {
        root.removeAll()
        root.append(postcss.atRule({ name: 'layer', params: 'utilities', nodes: [postcss.rule({
          selector: '.generated',
          nodes: [postcss.decl({ prop: 'color', value: 'color-mix(in srgb, red 50%, transparent)' })],
        })] }))
      },
    }] } })
    const css = '.input{}'
    const combined = await postcss(handler.getPipeline().plugins).process(css, { from: undefined })
    const staged = await handler(css)
    expect(staged.css).toBe(combined.css)
    expect(staged.css).toContain('rgba(255, 0, 0, 0.5)')
  })
  it('作者阶段执行显式传入插件，框架重放仍排除重复生成插件', async () => {
    const Once = vi.fn((root) => { root.append({ selector: '.plugin-output', nodes: [{ prop: 'color', value: 'red' }] }) })
    const plugin = { postcssPlugin: '@tailwindcss/postcss', Once }
    const options = { plugins: [plugin] }
    const handler = createStyleHandler({ cssPreflight: false, postcssOptions: options })
    expect((await handler('.a{color:blue}')).css).toContain('.plugin-output')
    expect(Once).toHaveBeenCalledTimes(1)
    expect((await processFrameworkCss('.a{color:blue}', options)).css).not.toContain('.plugin-output')
    expect(Once).toHaveBeenCalledTimes(1)
  })
})
