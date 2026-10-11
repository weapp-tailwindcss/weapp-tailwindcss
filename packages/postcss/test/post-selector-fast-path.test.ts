import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { createStyleHandler } from '@/handler'
import { createFallbackPlaceholderCleaner, createRootSpecificityCleaner } from '@/plugins/post/specificity-cleaner'
import { getFallbackRemove } from '@/selectorParser'

describe('后处理选择器快速路径', () => {
  it.each(['.plain', '#identity', '.u-1000', ' .spaced ', '.parent > .child', '.a,.b', String.raw`.hover\:a`, '.a:is(.b)', '[hidden]', '*'])('规则与完整解析器输出一致：%s', (selector) => {
    const parser = getFallbackRemove()
    const expected = postcss.parse(`${selector}{color:red}`)
    parser.transformSync(expected.first as postcss.Rule, { lossless: false, updateSelector: true })
    const root = postcss.parse(`${selector}{color:red}`)
    parser.transformSync(root.first as postcss.Rule)
    expect((root.first as postcss.Rule | undefined)?.selector ?? '').toBe((expected.first as postcss.Rule | undefined)?.selector ?? '')
  })

  it('保留前置逗号与转义语义，并清除真实占位符', () => {
    const fallback = createFallbackPlaceholderCleaner()
    const rootSpecificity = createRootSpecificityCleaner({ cssSelectorReplacement: { root: 'page' } })!
    const rule = postcss.rule({ selector: 'page:not(.does-not-exist),.a:not(#n),.plain' })
    fallback(rule)
    rootSpecificity(rule)
    expect(rule.selectors).toEqual(['page', '.a', '.plain'])
    const plain = postcss.rule({ selector: '.a\\,b,.plain' })
    fallback(plain)
    rootSpecificity(plain)
    expect(plain.selector).toBe('.a\\,b,.plain')
  })

  it('仅向完整根作用域追加 host，普通 class/id 保持不变', async () => {
    const handler = createStyleHandler({ cssPreflight: false, majorVersion: 4 })
    const result = await handler('page,.tw-root,wx-root-portal-content{color:red}.plain{display:block}')
    expect(result.css).toContain('page,.tw-root,wx-root-portal-content,:host')
    expect(result.css).toContain('.plain{display:block}')
  })
})
