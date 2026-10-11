import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasNonCommentCss, isCssImportOnly, removeCommentOnlyAtRules, restoreProcessedCssImports } from '../src/compat/processed-css/cleanup'
import { removeTailwindEntryDirectivesFromCss } from '../src/compat/processed-css/entry-directives'
import { collectImportedCssFiles, normalizeInjectableCssWithImports } from '../src/compat/processed-css/imports'
import { removeCssCoveredByRootStyleSources, removeScopedTailwindPreflightCss } from '../src/compat/scoped-css/cleanup'
import { collectRootScopedComparableCssCoverage } from '../src/compat/scoped-css/coverage'
import { removeCssRulesCoveredBySources } from '../src/compat/scoped-css/covered-rules'

describe('processed CSS ownership', () => {
  afterEach(() => vi.restoreAllMocks())

  it('reuses the parsed scoped stylesheet when removing trailing source comments', () => {
    const parse = vi.spyOn(postcss, 'parse')
    const css = '/*! tailwindcss v4 */ /* tokens: generated */ *[data-v-a]{margin:0} /* tokens: stale */'
    expect(removeScopedTailwindPreflightCss(css)).toBe('')
    expect(parse).toHaveBeenCalledTimes(1)
    expect(removeCssCoveredByRootStyleSources(' /* only a comment */ ', ['.a{color:red}'])).toBe('')
    expect(hasNonCommentCss(' /* only a comment */ ')).toBe(false)
    expect(hasNonCommentCss(' ')).toBe(false)
  })

  it('preserves declaration union coverage and exact-only behavior', () => {
    const sources = ['.a{color:red}.a{display:flex}']
    const coverage = collectRootScopedComparableCssCoverage(sources)
    const css = '.a[data-v-a]{color:red;display:flex}.b[data-v-a]{color:red!important}'
    expect(removeCssRulesCoveredBySources(css, sources, {}, coverage)).toBe('.b[data-v-a]{color:red!important}')
    expect(removeCssRulesCoveredBySources(css, sources, { exactOnly: true }, coverage)).toBe(css)
    expect(removeCssRulesCoveredBySources('.a{', sources)).toBe('.a{')
    expect([...coverage.declarationsBySelector.get('.a')!]).toEqual(['color:red', 'display:flex'])
  })

  it('delegates import identity while retaining platform cleanup and malformed fallbacks', () => {
    const resolve = (request: string) => request.startsWith('.') ? request : undefined
    const source = '@import "package";\n@import "./theme.acss";\n.a{color:red}'
    const mini = normalizeInjectableCssWithImports(source, true, resolve)
    expect(mini.css).not.toContain('"package"')
    expect([...mini.importedStyleFiles]).toEqual(['./theme.acss'])
    expect(normalizeInjectableCssWithImports(source, false, resolve).css).toBe(source)
    const broken = '@import "package";\n@import "./theme.acss";\n.broken{'
    expect(normalizeInjectableCssWithImports(broken, true, resolve).css).toBe('@import "./theme.acss";\n.broken{')
    expect([...collectImportedCssFiles(broken, resolve)]).toEqual(['./theme.acss'])
    expect(restoreProcessedCssImports(source, '.a{color:red}', true)).toBe('@import "./theme.acss";\n.a{color:red}')
    expect(restoreProcessedCssImports(source, '.a{color:red}')).toBe(source)
  })

  it('keeps import shells and authored layers while removing consumed directives', () => {
    expect(isCssImportOnly('/* comment */ @import "./a.css";')).toBe(true)
    expect(isCssImportOnly('@import "./a.css";.a{}')).toBe(false)
    expect(isCssImportOnly('@import "./a.css";.a{')).toBe(false)
    expect(removeCommentOnlyAtRules('@media screen{/* marker */}.a{color:red}')).toBe('.a{color:red}')
    const source = '@theme{--spacing:1rpx}@layer components{.a{color:red}}'
    expect(removeTailwindEntryDirectivesFromCss(source, true)).toBe('@layer components{.a{color:red}}')
  })
})
