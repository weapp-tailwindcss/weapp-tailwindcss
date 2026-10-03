import { describe, expect, it } from 'vitest'
import { isTailwindRuntimePropertyRule, postcss, retainUniAppXAuthorApplyCss, transformWebCssCompat } from '../src'
import { filterTailwindV4ApplyOnlyGeneratedCss } from '../src/compat/tailwindcss-v4/user-css/apply-only'

describe('uni-app x author structural selectors', () => {
  it('preserves shared variable scopes before narrowing ordinary merged rules', () => {
    const source = '.card { @apply flex; } .other { @apply text-[var(--x)]; }'
    const generated = '.card, :root { --x: red; } .card, .generated { display: flex; } .other { color: var(--x); }'
    const result = filterTailwindV4ApplyOnlyGeneratedCss(generated, source)
    expect(result).toContain('.card, :root')
    expect(result).toContain('color: var(--x)')
    expect(result).not.toContain('.generated')
    const withoutVariables = filterTailwindV4ApplyOnlyGeneratedCss(generated, source, { preserveVariables: false })
    expect(withoutVariables).not.toContain(':root')
    expect(withoutVariables).toContain('.card')
  })

  it.each([
    ['author retention', retainUniAppXAuthorApplyCss],
    ['apply-only generation', filterTailwindV4ApplyOnlyGeneratedCss],
  ])('%s retains spacing descendants and conditions while rejecting unrelated subjects', (_name, retain) => {
    const source = '.local { @apply space-y-2.5 space-x-3; }'
    const css = [
      '.local > view + view { margin-top: 10px; }',
      '.local > :not([hidden]) ~ :not([hidden]) { margin-left: 12px; }',
      '@media (min-width: 640px) { .local:hover > * + * { margin-top: 20px; } }',
      '@supports (display: grid) { .theme-dark .local > view + view { margin-left: 24px; } }',
      '.local .generated { color: red; }',
      ':not(.local) > view + view { color: blue; }',
      '.generated { display: flex; }',
      '.local, .generated-list { z-index: 42; }',
    ].join('\n')
    const result = retain(css, source)
    expect(result).toContain('margin-top: 10px')
    expect(result).toContain('margin-left: 12px')
    expect(result).toContain('margin-top: 20px')
    expect(result).toContain('margin-left: 24px')
    expect(result).toContain('@media')
    expect(result).toContain('@supports')
    expect(result).not.toContain('.generated')
    expect(result).not.toContain(':not(.local)')
    const mixedRule = postcss.parse(result).nodes.find(node => node.type === 'rule' && node.toString().includes('z-index'))
    expect(mixedRule?.type === 'rule' && mixedRule.selector).toBe('.local')
  })

  it.each([
    ['author retention', retainUniAppXAuthorApplyCss],
    ['apply-only generation', filterTailwindV4ApplyOnlyGeneratedCss],
  ])('%s preserves authored type, attribute and complex selector variants', (_name, retain) => {
    const source = '.parent .child { @apply hover:bg-red-500; } button { @apply hover:bg-red-500; } [data-active] { @apply hover:opacity-50; }'
    const css = '@media (hover: hover) { .parent .child:hover { color: red; } button:hover { color: red; } [data-active]:hover { opacity: .5; } .generated { color: blue; } }'
    const result = retain(css, source)
    expect(result).toContain('.parent .child:hover')
    expect(result).toContain('button:hover')
    expect(result).toContain('[data-active]:hover')
    expect(result).not.toContain('.generated')
  })

  it.each([
    ['author retention', retainUniAppXAuthorApplyCss],
    ['apply-only generation', filterTailwindV4ApplyOnlyGeneratedCss],
  ])('%s preserves the input when an author selector cannot be parsed', (_name, retain) => {
    const generated = '.generated { display: flex; }'
    expect(retain(generated, '.local:() { @apply flex; }')).toBe(generated)
  })
})

describe('uni-app x author runtime initialization', () => {
  it.each(['*', '*, ::before, ::after, ::backdrop', '*[data-v-test], [data-v-test]::before', '[data-v-test]'])('recognizes runtime scope %s', (selector) => {
    const rule = postcss.rule({ selector, nodes: [postcss.decl({ prop: '--tw-shadow', value: '0 0 #0000' })] })
    expect(isTailwindRuntimePropertyRule(rule)).toBe(true)
    rule.append(postcss.decl({ prop: 'box-sizing', value: 'border-box' }))
    expect(isTailwindRuntimePropertyRule(rule)).toBe(false)
  })

  it.each(['.shadow', 'view', ':root', ':hover', '* > *'])('rejects utility, theme and element scope %s', (selector) => {
    const rule = postcss.rule({ selector, nodes: [postcss.decl({ prop: '--tw-shadow', value: 'red' })] })
    expect(isTailwindRuntimePropertyRule(rule)).toBe(false)
  })

  const author = '.local { @apply shadow-md; }'
  const generated = `
    @property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
    @property --tw-inset-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }
    @property --tw-unused { syntax: "*"; inherits: false; initial-value: 1; }
    * { box-sizing: border-box; }
    :root { --color-red: red; }
    .unrelated { color: red; }
    .local { --tw-shadow: 0 4px red; box-shadow: var(--tw-inset-shadow), var(--tw-shadow); }
  `

  it.each([true, false])('retains only used runtime properties, with webCompat=%s', (webCompat) => {
    const css = transformWebCssCompat(generated, webCompat)
    const result = retainUniAppXAuthorApplyCss(css, author, { preserveRuntimeProperties: true })
    expect(result).toContain('--tw-inset-shadow')
    expect(result).not.toContain('--tw-unused')
    expect(result).not.toContain(':root')
    expect(result).not.toContain('box-sizing')
    expect(result).not.toContain('.unrelated')
    expect(result).toContain('var(--tw-inset-shadow), var(--tw-shadow)')
    expect(retainUniAppXAuthorApplyCss(result, author, { preserveRuntimeProperties: true })).toBe(result)
    if (webCompat) {
      expect(result.indexOf('--tw-inset-shadow: 0 0 #0000')).toBeLessThan(result.indexOf('.local'))
    }
    else {
      expect(result).toContain('@property --tw-inset-shadow')
    }
  })

  it('preserves existing native pruning by default', () => {
    const result = retainUniAppXAuthorApplyCss(generated, author)
    expect(result).not.toContain('@property')
    expect(result).not.toContain('box-sizing')
    expect(result).toContain('.local')
  })

  it('keeps runtime properties used by the author branch of a merged rule', () => {
    const result = retainUniAppXAuthorApplyCss(
      generated.replace('.local {', '.local, .unrelated-shadow {'),
      author,
      { preserveRuntimeProperties: true },
    )
    expect(result).toContain('.local')
    expect(result).toContain('@property --tw-inset-shadow')
    expect(result).not.toContain('.unrelated-shadow')
    expect(result).not.toContain('--tw-unused')
  })
})
