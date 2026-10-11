import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeLegacyCompatCssSource, removeMiniProgramContainerCompatCss } from '../src/compat/legacy-css/source-cleanup'
import { normalizeMiniProgramGeneratorCssSource, normalizeMiniProgramImportShell } from '../src/compat/mini-program-css/output-import-shell'
import { deduplicateGeneratedCssRules } from '../src/compat/tailwindcss-v4/user-css/rule-deduplication'
import { createUniAppXHarmonyApplyCssExpander } from '../src/compat/uni-app-x/harmony-apply'
import { rewriteUniAppXStyleReferences } from '../src/compat/uni-app-x/reference-paths'

describe('migrated style transforms', () => {
  afterEach(() => vi.restoreAllMocks())

  it('indexes generated declarations once and clones only matching apply rules', () => {
    const clone = vi.spyOn(postcss.Declaration.prototype, 'clone')
    const source = Array.from({ length: 500 }, (_, i) => `.unused-${i}{color:red}`).join('')
    const expand = createUniAppXHarmonyApplyCssExpander(`${source}.match{width:3rpx;color:blue!important}`)!
    expect(clone).not.toHaveBeenCalled()
    const css = '@reference "./theme.css"; .match{@apply w-3}'
    const first = expand(css)
    expect(first).not.toContain('@reference')
    expect(first).toContain('width:3rpx')
    expect(first).toContain('color:blue!important')
    expect(clone).toHaveBeenCalledTimes(2)
    expect(expand(css)).toBe(first)
    expect(clone).toHaveBeenCalledTimes(4)
    expect(expand('.unmatched{@apply flex}')).toBe('.unmatched{@apply flex}')
    expect(expand('@reference "./theme.css"; .match{@apply w-3}.other{@apply flex}')).toContain('@reference')
    expect(expand('.broken{@apply flex')).toBe('.broken{@apply flex')
    expect(createUniAppXHarmonyApplyCssExpander('.broken{')).toBeUndefined()
  })

  it('lets the caller resolve reference paths and preserves source syntax', () => {
    const resolve = vi.fn(request => `/styles/${request.slice(2)}`)
    const result = rewriteUniAppXStyleReferences('@reference "./theme.css" layer(theme); @reference "package"; .a{@apply flex}', resolve)
    expect(resolve.mock.calls).toEqual([['./theme.css']])
    expect(result).toContain('@reference "/styles/theme.css" layer(theme)')
    expect(result).toContain('@reference "package"')
    expect(rewriteUniAppXStyleReferences('.broken{', resolve)).toBe('.broken{')
  })

  it('preserves media context, important declarations and cascade order while deduplicating', () => {
    const css = '.a:before{content:"x"}.a::before{content:\'x\'}@media print{.a::before{content:"x"}}.a::before{content:"x"!important}'
    const root = postcss.parse(deduplicateGeneratedCssRules(css))
    const rules: string[] = []
    root.walkRules(rule => { rules.push(rule.toString()) })
    expect(rules).toHaveLength(3)
    expect(root.toString()).toContain('@media print')
    expect(root.toString()).toContain('!important')
    expect(deduplicateGeneratedCssRules('.broken{')).toBe('.broken{')
  })

  it('uses bundle asset identity for generic CSS imports, including logical backslashes', () => {
    expect(normalizeMiniProgramImportShell('@import "theme.css?v=1";@import "package.css";', {
      outputFile: 'pages/index.css',
      outputFiles: ['pages\\theme.css'],
      cssOnly: true,
    })).toBe('@import "./theme.css?v=1";@import "package.css";')
    expect(normalizeMiniProgramGeneratorCssSource('@import "./index.wxss";.a{color:red}', 'pages/index.wxss'))
      .toBe('.a{color:red}')
    expect(normalizeMiniProgramImportShell('@import "theme.acss";')).toBe('@import "./theme.acss";')
  })

  it('repairs legacy source blocks without counting braces in strings or comments', () => {
    const result = normalizeLegacyCompatCssSource('.a{content:"{";/* } */color:red')
    expect(() => postcss.parse(result)).not.toThrow()
    expect(result).toContain('content:"{"')
    expect(result).toContain('color:red')
    expect(removeMiniProgramContainerCompatCss('@media screen{.container{width:100%}}.container,.author{display:block}'))
      .toBe('.container,.author{display:block}')
  })
})
