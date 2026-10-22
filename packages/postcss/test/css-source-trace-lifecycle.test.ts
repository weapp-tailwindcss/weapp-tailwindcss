import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { removeCssCoveredByRootStyleSources } from '../src/compat'
import { removeCssRulesCoveredBySources } from '../src/compat/scoped-css/covered-rules'
import { removeUnsupportedModernColorDeclarations } from '../src/compat/mini-program-css/root-cleanups'
import { annotateCssTokenSources, collectCssTokenSourceTraceEdits } from '../src/utils/css-source-trace'
import { dedupeCoveredCssRules, filterExistingCssRules, mergeCoveredCssRuleDeclarations } from '../src/vite-css-rules'

const trace = '/*! tokens: active:bg-red-500 <= src/page.vue */'
const rule = '.active\\:bg-red-500:active{color:red}'
const tails = ['@property --tw-content{syntax:"*";inherits:false;initial-value:""}', '*{--tw-translate-x:0}']

describe('追踪元数据跟随宿主规则的生命周期', () => {
  it.each([
    [String.raw`.h-\[137px\]`, 'h-[137px]'],
    [String.raw`.hover\:h-\[137px\]:hover`, 'hover:h-[137px]'],
    [String.raw`.\32 xl\:w-1\/2`, '2xl:w-1/2'],
    [String.raw`.bg-\[url\(a\.png\)\]`, 'bg-[url(a.png)]'],
    [String.raw`.content-\[\'a\|b\'\]`, "content-['a|b']"],
  ])('用真实 class token 解析 %s 的来源', (selector, token) => {
    const source = new Map([[token, { token, sources: ['src/fixture.vue'] }]])
    const annotated = annotateCssTokenSources(`${selector}{color:red}`, source)
    expect(annotated).toContain(`${token} <= src/fixture.vue`)
    expect(annotateCssTokenSources(annotated, source)).toBe(annotated)
    expect(filterExistingCssRules(`${selector}{color:red}`, `${annotated}${tails[0]}`)).not.toContain('tokens:')
    expect(collectCssTokenSourceTraceEdits(`${selector}{color:red}`, source)).toHaveLength(1)
  })

  it.each(tails)('删除覆盖规则后不能漂移到 %s', (tail) => {
    const source = `${trace}${rule}${tail}`
    const outputs = [
      filterExistingCssRules(rule, source),
      mergeCoveredCssRuleDeclarations(rule, source).css,
      removeCssRulesCoveredBySources(source, [rule]),
      removeCssCoveredByRootStyleSources(source, [rule]),
    ]
    for (const output of outputs) {
      expect(output).not.toContain('tokens:')
      expect(postcss.parse(output).toString()).toBe(tail)
    }
  })

  it('声明迁移和后出现的覆盖规则保留目标宿主的合并来源', () => {
    const otherTrace = '/*! tokens: text-red-500 <= src/other.vue */'
    const base = `${otherTrace}.active\\:bg-red-500:active{color:red}`
    const incoming = `${trace}.active\\:bg-red-500:active{color:red;background:red}${tails[0]}`
    const merged = mergeCoveredCssRuleDeclarations(base, incoming)
    expect(merged.css).toBe(tails[0])
    expect(merged.baseCss).toContain('src/page.vue')
    expect(merged.baseCss).toContain('src/other.vue')
    expect(merged.baseCss).toContain('background:red')
    const cleaned = removeCssCoveredByRootStyleSources(merged.baseCss, ['.unrelated{display:block}'])
    expect(cleaned).toContain('src/page.vue')
    expect(cleaned).toContain('src/other.vue')
    const scoped = `${merged.baseCss.replaceAll(':active', ':active[data-v-a]')}/*! tailwindcss v4 */`
    const scopedCleaned = removeCssCoveredByRootStyleSources(scoped, ['.unrelated{display:block}'])
    expect(scopedCleaned).toContain('src/page.vue')
    expect(scopedCleaned).toContain('src/other.vue')
    const deduped = dedupeCoveredCssRules(`${base}${trace}${rule}`)
    expect(deduped).toContain('src/page.vue')
    expect(deduped).toContain('src/other.vue')
    const root = postcss.parse(deduped)
    expect(root.nodes.filter(node => node.type === 'rule')).toHaveLength(1)
    expect(root.last?.type).toBe('rule')
  })

  it('保留未删除宿主、邻居追踪和作者 tokens 说明', () => {
    const author = '/* tokens: 作者说明 */'
    const neighbor = '/*! tokens: p-4 <= src/neighbor.vue */.p-4{padding:1rem}'
    const source = `${author}${trace}${rule}${neighbor}`
    const result = filterExistingCssRules(rule, source)
    expect(result).toContain(author)
    expect(result).not.toContain('src/page.vue')
    expect(result).toContain(neighbor)
    expect(removeCssCoveredByRootStyleSources(`${author}${trace}${rule}${tails[0]}`, [rule])).toContain(author)
    expect(filterExistingCssRules('.unrelated{color:red}', source)).toBe(source)
    const tokens = new Map([['p-4', { token: 'p-4', sources: ['src/neighbor.vue'] }]])
    expect(annotateCssTokenSources(`${author}.p-4{padding:1rem}`, tokens)).toContain(author)
    const edits = collectCssTokenSourceTraceEdits(`${author}.p-4{padding:1rem}`, tokens)
    expect(edits.every(edit => edit.start >= author.length)).toBe(true)
  })

  it('只在最后声明被拒绝且宿主删除时清除其 trace', () => {
    for (const surviving of ['', 'display:block']) {
      const root = postcss.parse(`${trace}.probe{color:color-mix(in oklab,var(--missing) 50%,transparent);${surviving}}${tails[0]}`)
      removeUnsupportedModernColorDeclarations(root)
      expect(root.toString().includes('src/page.vue')).toBe(Boolean(surviving))
      expect(root.toString()).toContain(tails[0])
      if (surviving) {
        expect(root.toString()).toContain('.probe{display:block}')
      }
    }
  })
})
