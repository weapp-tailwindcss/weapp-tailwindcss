import { injectTailwindDirectives } from '@/compat/tailwind-directive-injection'
import { postcss } from '@/postcss-runtime'

describe('Tailwind 指令插入', () => {
  const options = {
    directiveParams: ['base', 'components', 'utilities'],
    insertAfterAtRulesNames: ['import', 'use'],
    matchesComment: (text: string) => text.includes('@import'),
  }

  it.each([
    '@import "a"; /* @import b */ .x {}',
    '/* @import b */ @use "a"; .x {}',
  ])('在最后一个有效注释或指令锚点后插入，并保持幂等：%s', (css) => {
    const root = postcss.parse(css)
    injectTailwindDirectives(root, options)
    expect(root.nodes.map(node => node.type === 'atrule' ? node.name + ':' + node.params : node.type)).toEqual([
      ...postcss.parse(css).nodes.slice(0, 2).map(node => node.type === 'atrule' ? node.name + ':' + node.params : node.type),
      'tailwind:base', 'tailwind:components', 'tailwind:utilities', 'rule',
    ])
    const first = root.toString()
    injectTailwindDirectives(root, options)
    expect(root.toString()).toBe(first)
  })

  it('没有锚点时按配置顺序前插，仅检查根级已有参数', () => {
    const root = postcss.parse('@layer base; .x { @tailwind utilities; }')
    injectTailwindDirectives(root, { ...options, directiveParams: ['base', 'components', 'components', 'utilities'] })
    expect(root.nodes.slice(0, 3).map(node => node.toString())).toEqual([
      '@tailwind components', '@tailwind utilities', '@layer base',
    ])
  })
})
