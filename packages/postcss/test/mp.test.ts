import postcss from 'postcss'
import { Declaration } from 'postcss'
import { vi } from 'vitest'
import { commonChunkPreflight } from '@/mp'

describe('mp', () => {
  it('commonChunkPreflight case 0', () => {
    const root = postcss.parse('.foo { color: red; }')
    commonChunkPreflight(root.first as postcss.Rule, {})
    expect(root.toString()).toBe('.foo { color: red; }')
  })

  it('splits ordinary rule selectors only once per preflight visit', () => {
    const root = postcss.parse('.foo::before,.foo:hover { color: red; }')
    const rule = root.first as postcss.Rule
    const selectors = vi.spyOn(rule, 'selectors', 'get')
    commonChunkPreflight(rule, { majorVersion: 4 })
    expect(selectors).toHaveBeenCalledTimes(1)
    expect(root.toString()).toBe('.foo::before,.foo:hover { color: red; }')
  })

  it('commonChunkPreflight case 1', () => {
    const root = postcss.parse(':root,:host { color: red; }')
    commonChunkPreflight(root.first as postcss.Rule, {})
    expect(root.toString()).toBe(':root,:host { color: red; }')
  })

  it('commonChunkPreflight appends :host when only :root exists', () => {
    const root = postcss.parse(':root { color: red; }')
    commonChunkPreflight(root.first as postcss.Rule, {})
    expect(root.toString()).toBe(':root, :host { color: red; }')
  })

  it('commonChunkPreflight case 2', () => {
    const root = postcss.parse(':root,:host { color: red; }')
    commonChunkPreflight(root.first as postcss.Rule, { injectAdditionalCssVarScope: true })
    expect(root.toString()).toBe(':root,:host { color: red; }')
  })

  it('commonChunkPreflight does not inject pseudo content init into v4 root scopes', () => {
    const root = postcss.parse(':root,:host { --color-red-500: red; }')
    commonChunkPreflight(root.first as postcss.Rule, { injectAdditionalCssVarScope: true, majorVersion: 4 })
    const css = root.toString()
    expect(css).not.toContain('--tw-content')
    expect(css).toContain('--color-red-500')
    expect(css).toContain(':root,:host')
  })

  it('commonChunkPreflight injects only used Tailwind v4 variables', () => {
    const root = postcss.parse([
      ':root,:host { --color-red-500: red; }',
      '.bg-gradient-to-t {',
      '  --tw-gradient-position: to top;',
      '  background-image: linear-gradient(var(--tw-gradient-stops));',
      '}',
      '.shadow { box-shadow: var(--tw-shadow); }',
    ].join('\n'))
    commonChunkPreflight(root.first as postcss.Rule, { injectAdditionalCssVarScope: true, majorVersion: 4 })
    const css = root.toString()

    expect(css).toContain('--tw-gradient-position: initial')
    expect(css).toContain('--tw-gradient-stops: initial')
    expect(css).toContain('--tw-shadow: 0 0 #0000')
    expect(css).not.toContain('--tw-content')
    expect(css).not.toContain('--tw-scrollbar-thumb')
    expect(css).not.toContain('--tw-translate-x')
  })

  it('commonChunkPreflight injects Tailwind v4 content init only when content variable is used', () => {
    const root = postcss.parse([
      ':root,:host { --color-red-500: red; }',
      '.before\\:content-\\[\\\"x\\\"\\]::before {',
      '  --tw-content: "x";',
      '  content: var(--tw-content);',
      '}',
    ].join('\n'))
    commonChunkPreflight(root.first as postcss.Rule, { injectAdditionalCssVarScope: true, majorVersion: 4 })
    const css = root.toString()

    expect(css).toContain('--tw-content: ""')
    expect(css).toContain('--tw-content: "x"')
    expect(css).toContain('content: var(--tw-content)')
    expect(css).not.toContain('--tw-gradient-stops')
  })

  it('does not scan the root for ordinary class rules when removing content init', () => {
    const root = postcss.parse('.utility { --tw-content: ""; color: red; }')
    const scan = vi.spyOn(root, 'walkDecls')
    commonChunkPreflight(root.first as postcss.Rule, { majorVersion: 4 })

    expect(scan).not.toHaveBeenCalled()
    expect(root.toString()).toBe('.utility { --tw-content: ""; color: red; }')
  })

  it('queries current content usage when called directly', () => {
    const root = postcss.parse([
      ':root { --tw-content: ""; }',
      '.before::before { content: var(--tw-content); }',
    ].join('\n'))

    commonChunkPreflight(root.first as postcss.Rule, { majorVersion: 4 })
    expect(root.toString()).toContain('--tw-content: ""')

    const unusedRoot = postcss.parse(':root { --tw-content: ""; }')
    commonChunkPreflight(unusedRoot.first as postcss.Rule, { majorVersion: 4 })
    expect(unusedRoot.toString()).not.toContain('--tw-content')
  })

  it('invalidates cached content usage after preflight injection', () => {
    const root = postcss.parse('::before,::after { --tw-a: 1; --tw-b: 2; }')
    const read = vi.fn(() => false)
    const invalidate = vi.fn()

    commonChunkPreflight(root.first as postcss.Rule, {
      majorVersion: 4,
      cssInjectPreflight: () => [new Declaration({ prop: 'color', value: 'blue' })],
    }, { read, invalidate })

    expect(read).toHaveBeenCalledTimes(1)
    expect(invalidate).toHaveBeenCalled()
  })
})
