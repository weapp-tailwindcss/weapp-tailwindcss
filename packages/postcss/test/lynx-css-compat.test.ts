import { transformLynxCssCompat, transformWebCssCompat } from '@/index'

describe('Lynx CSS compatibility transform', () => {
  it('inlines Tailwind theme values and reduces static calculations', () => {
    const css = [
      ':root, :host {',
      '  --color-sky-500: rgb(0, 165, 234);',
      '  --spacing: 0.25rem;',
      '  --text-lg: 1.125rem;',
      '  --text-lg--line-height: calc(1.75 / 1.125);',
      '  --font-weight-bold: 700;',
      '  --font-sans: sans-serif;',
      '  --default-font-family: var(--font-sans);',
      '}',
      '.bg-sky-500 { background-color: var(--color-sky-500); }',
      '.p-6 { padding: calc(var(--spacing) * 6); }',
      '.text-lg { font-size: var(--text-lg); line-height: var(--tw-leading, var(--text-lg--line-height)); }',
      '.font-bold { --tw-font-weight: var(--font-weight-bold); font-weight: var(--font-weight-bold); }',
    ].join('\n')

    const result = transformLynxCssCompat(css)

    expect(result).toContain('background-color: rgb(0, 165, 234)')
    expect(result).toContain('padding: 1.5rem')
    expect(result).toContain('font-size: 1.125rem')
    expect(result).toContain('line-height: var(--tw-leading, 1.55556)')
    expect(result).toContain('font-weight: 700')
    expect(result).toContain('--tw-font-weight: 700')
    expect(result).not.toContain('var(--spacing)')
    expect(result).not.toContain('--color-sky-500:')
    expect(result).not.toContain('--default-font-family:')
  })

  it('preserves authored dynamic variables and literal arbitrary values', () => {
    const css = [
      ':root { --brand-color: #123456; --spacing: 0.25rem; }',
      '.dynamic { background: var(--brand-color); width: var(--panel-width, 20px); }',
      '.arbitrary { color: #c31d6b; padding: 13px; }',
    ].join('\n')

    const result = transformLynxCssCompat(css)

    expect(result).toContain('--brand-color: #123456')
    expect(result).toContain('background: var(--brand-color)')
    expect(result).toContain('width: var(--panel-width, 20px)')
    expect(result).toContain('color: #c31d6b')
    expect(result).toContain('padding: 13px')
  })

  it('runs after legacy web color normalization', () => {
    const webCss = transformWebCssCompat([
      '@theme { --color-sky-500: oklch(68.5% 0.169 237.323); }',
      '@layer utilities { .bg-sky-500 { background-color: var(--color-sky-500); } }',
    ].join('\n'), true)
    const result = transformLynxCssCompat(webCss)

    expect(result).toContain('.bg-sky-500')
    expect(result).toContain('background-color: rgb(')
    expect(result).not.toContain('oklch(')
    expect(result).not.toContain('var(--color-sky-500)')
  })

  it('keeps registered Tailwind defaults on selectors accepted by the native encoder without theme variables', () => {
    const webCss = transformWebCssCompat([
      '@property --tw-border-style { syntax: "*"; inherits: false; initial-value: solid; }',
      '.border { border-style: var(--tw-border-style); border-width: 1px; }',
    ].join('\n'), true)
    const result = transformLynxCssCompat(webCss)

    expect(result).toContain('*, ::before, ::after {')
    expect(result).toContain('--tw-border-style: solid')
    expect(result).not.toContain('::backdrop')
    expect(result).toContain('border-style: var(--tw-border-style)')
  })

  it('normalizes default variable groups with reordered legacy pseudo-elements inside supports', () => {
    const result = transformLynxCssCompat('@supports (display: grid) { ::backdrop, :after, *, :before { --tw-shadow: 0 0 #0000; } }')

    expect(result).toContain(':after, *, :before { --tw-shadow: 0 0 #0000; }')
    expect(result).not.toContain('::backdrop')
  })

  it('preserves authored selectors and declarations outside Tailwind default variable groups', () => {
    const css = [
      '*, ::backdrop { color: red; --tw-shadow: none; }',
      '*, ::backdrop { --app-color: red; }',
      '*, ::backdrop { --tw-shadow: none; }',
      '.custom, ::backdrop { --tw-shadow: none; }',
      '.peer-checked:is(:where(.peer):checked ~ *) { opacity: 1; }',
    ].join('\n')

    expect(transformLynxCssCompat(css)).toBe(css)
  })

  it('inlines default transition and mono font theme values while preserving authored dynamic variables', () => {
    const result = transformLynxCssCompat([
      ':root, :host { --default-transition-duration: 150ms; --default-transition-timing-function: ease; --font-mono: monospace; --default-mono-font-family: var(--font-mono); --default-panel-size: 20px; }',
      '.transition { transition-duration: var(--tw-duration, var(--default-transition-duration)); transition-timing-function: var(--tw-ease, var(--default-transition-timing-function)); }',
      '.mono { font-family: var(--default-mono-font-family); }',
      '.panel { width: var(--default-panel-size); }',
    ].join('\n'))

    expect(result).toContain('transition-duration: var(--tw-duration, 150ms)')
    expect(result).toContain('transition-timing-function: var(--tw-ease, ease)')
    expect(result).toContain('font-family: monospace')
    expect(result).not.toContain('--default-transition-')
    expect(result).not.toContain('--default-mono-font-')
    expect(result).toContain('--default-panel-size: 20px')
    expect(result).toContain('width: var(--default-panel-size)')
  })

  it.each([
    '.slow { --default-transition-duration: 1s; }',
    '@media (min-width: 600px) { :root { --default-transition-duration: 1s; } }',
    '@supports (display: grid) { :root { --default-transition-duration: 1s; } }',
    '.dark, :root { --default-transition-duration: 1s; }',
    ':root { .slow { --default-transition-duration: 1s; } }',
    ':root { --default-transition-duration: 1s !important; }',
  ])('preserves theme variables and aliases with a scoped or conditional override: %s', (override) => {
    const css = [
      ':root { --default-transition-duration: 150ms; --default-transition-alias: var(--default-transition-duration); --spacing: 0.25rem; }',
      override,
      '.transition { transition-duration: var(--default-transition-alias); }',
      '.direct { transition-duration: var(--default-transition-duration); }',
      '.p-4 { padding: calc(var(--spacing) * 4); }',
    ].join('\n')
    const result = transformLynxCssCompat(css)

    expect(result).toContain('--default-transition-duration: 150ms')
    expect(result).toContain(override)
    expect(result).toContain('--default-transition-alias: var(--default-transition-duration)')
    expect(result).toContain('transition-duration: var(--default-transition-alias)')
    expect(result).toContain('transition-duration: var(--default-transition-duration)')
    expect(result).toContain('padding: 1rem')
  })

  it('preserves unresolved and cyclic theme aliases', () => {
    const css = [
      ':root { --font-a: var(--font-b); --font-b: var(--font-a); --default-mono-font-family: var(--app-font); }',
      '.a { font-family: var(--font-a); }',
      '.mono { font-family: var(--default-mono-font-family); }',
    ].join('\n')

    expect(transformLynxCssCompat(css)).toBe(css)
  })

  it.each(['initial', 'inherit', 'unset', 'revert', 'revert-layer'])('preserves %s custom property semantics and fallbacks', (keyword) => {
    const css = [
      `:root { --default-transition-duration: ${keyword}; --default-transition-alias: var(--default-transition-duration); }`,
      '.transition { transition-duration: var(--default-transition-duration, 150ms); }',
      '.alias { transition-duration: var(--default-transition-alias, 150ms); }',
    ].join('\n')

    expect(transformLynxCssCompat(css)).toBe(css)
  })
})
