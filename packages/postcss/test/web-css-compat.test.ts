import { normalizeWebCssCompatOptions, transformWebCssCompat, transformWebCssSafeSelectors } from '@/index'

describe('web css compatibility transform', () => {
  it('keeps css unchanged by default', () => {
    const css = '@layer utilities { .text-blue { color: oklch(62.3% .214 259.815); } }'

    expect(transformWebCssCompat(css, undefined)).toBe(css)
  })

  it('keeps css unchanged with off preset and disabled feature overrides', () => {
    const css = [
      '@layer utilities { .text-blue { color: oklch(62.3% .214 259.815); } }',
      '@supports (display: grid) { .grid { display: grid; } }',
    ].join('\n')

    expect(transformWebCssCompat(css, { preset: 'off' })).toBe(css)
    expect(transformWebCssCompat(css, {
      preset: 'legacy-web',
      features: {
        theme: false,
        layer: false,
        property: false,
        oklch: false,
        colorFunctions: false,
        supports: false,
      },
    })).toBe(css)
  })

  it('normalizes Tailwind CSS v4 runtime features with legacy-web preset', () => {
    const css = [
      '@theme { --color-blue-500: oklch(62.3% .214 259.815); }',
      '@layer utilities { .text-blue { color: var(--color-blue-500); } }',
      '@property --tw-rotate-x { syntax: "*"; inherits: false; }',
      '@supports (color: color-mix(in lab, red, red)) {',
      '  .bg-blue\\/50 { background-color: color-mix(in oklab, var(--color-blue-500) 50%, transparent); }',
      '}',
    ].join('\n')
    const result = transformWebCssCompat(css, true)

    expect(result).not.toContain('@theme')
    expect(result).not.toContain('@layer')
    expect(result).toContain('@property')
    expect(result).not.toContain('@supports')
    expect(result).toContain(':root')
    expect(result).toContain('--color-blue-500: rgb(')
    expect(result).not.toContain('--color-blue-500: oklch(')
    expect(result).toContain('.text-blue')
    expect(result).toContain('.bg-blue\\/50')
    expect(result).toContain('background-color: rgba(')
    expect(result).not.toContain('background-color: color-mix(')
  })

  it('静态化无条件主题层变量并保留局部覆盖的运行时级联', () => {
    const css = [
      '@layer theme { :root { --color-brand: oklch(63% .2 40); } }',
      '.stable { color: var(--color-brand); }',
    ].join('\n')
    const result = transformWebCssCompat(css, true)

    expect(result).toContain('.stable { color: rgb(')
    expect(result).not.toContain('var(--color-brand)')
    expect(result).not.toContain('oklch(')

    const dynamic = transformWebCssCompat([
      '@layer theme { :root { --color-brand: oklch(63% .2 40); } }',
      '.theme-dark { --color-brand: #00f; }',
      '.dynamic { color: var(--color-brand); }',
    ].join('\n'), true)
    expect(dynamic).toContain('.dynamic { color: var(--color-brand); }')
  })

  it('preserves runtime spacing and adds the WebKit text clip fallback once', () => {
    const css = [
      ':root { --spacing: 0.25rem; }',
      '.scope { --spacing: 0.5rem; }',
      '.p-5 { padding: calc(var(--spacing) * 5); }',
      '.space-y-5 > :not(:last-child) {',
      '  --tw-space-y-reverse: 0;',
      '  margin-block-start: calc(calc(var(--spacing) * 5) * var(--tw-space-y-reverse));',
      '  margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - var(--tw-space-y-reverse)));',
      '}',
      '.space-y-reverse > :not(:last-child) { --tw-space-y-reverse: 1; }',
      '.title { background-clip: text; }',
      '.prefixed { -WEBKIT-background-clip: text; background-clip: text; }',
    ].join('\n')
    const result = transformWebCssCompat(css, true)

    expect(result).toContain('.scope { --spacing: 0.5rem; }')
    expect(result).toContain('padding: calc(var(--spacing) * 5)')
    expect(result).toContain('margin-block-start: calc(calc(var(--spacing) * 5) * var(--tw-space-y-reverse))')
    expect(result).toContain('margin-block-end: calc(calc(var(--spacing) * 5) * calc(1 - var(--tw-space-y-reverse)))')
    expect(result).toContain('.title { -webkit-background-clip: text; background-clip: text; }')
    expect(result.match(/-webkit-background-clip: text/gi)).toHaveLength(2)
  })

  it('uses declared layer order in legacy web output without specificity placeholders', () => {
    const css = [
      '@layer base, components, utilities;',
      '@layer utilities { .utility { color: blue; } }',
      '@layer base { .base { color: red; } }',
      '@layer components { .component { color: green; } }',
      '.unlayered { color: black; }',
    ].join('\n')

    const result = transformWebCssCompat(css, true)

    expect(result).not.toContain('@layer')
    expect(result).not.toMatch(/:not\(#(?:n|\\#)?\)/)
    expect(result.indexOf('.base')).toBeLessThan(result.indexOf('.component'))
    expect(result.indexOf('.component')).toBeLessThan(result.indexOf('.utility'))
    expect(result.indexOf('.utility')).toBeLessThan(result.indexOf('.unlayered'))
  })

  it('resolves Tailwind CSS v4 color variables for legacy WebView background utilities', () => {
    const css = [
      '@theme {',
      '  --color-emerald-500: oklch(69.6% 0.17 162.48);',
      '  --color-zinc-950: oklch(14.1% 0.005 285.823);',
      '  --color-white: #fff;',
      '}',
      '.bg-emerald-500 { background-color: var(--color-emerald-500); }',
      '.bg-white { background-color: var(--color-white); }',
      '.dark\\:bg-zinc-950.theme-dark { background-color: var(--color-zinc-950); }',
      '.theme-dark .dark\\:bg-zinc-950 { background-color: var(--color-zinc-950); }',
    ].join('\n')
    const result = transformWebCssCompat(css, true)

    expect(result).toContain('.bg-emerald-500 { background-color: rgb(')
    expect(result).toContain('.bg-white { background-color: #fff; }')
    expect(result).toContain('.dark\\:bg-zinc-950.theme-dark { background-color: rgb(')
    expect(result).toContain('.theme-dark .dark\\:bg-zinc-950 { background-color: rgb(')
    expect(result).not.toContain('background-color: var(--color-')
    expect(result).not.toContain('oklch(')
  })

  it.each([
    ['Tailwind color', ':root { --color-brand: #f00; }'],
    ['application hex', ':root { --brand-color: #f00; }'],
    ['application modern color', ':root { --brand-color: oklch(63% .2 40); }'],
  ])('keeps %s use-site variables when a visible theme override exists', (_name, rootDeclaration) => {
    const property = rootDeclaration.includes('--color-brand') ? '--color-brand' : '--brand-color'
    const result = transformWebCssCompat([
      rootDeclaration,
      `.theme-dark { ${property}: #00f; }`,
      `.bg-brand { background-color: var(${property}); }`,
    ].join('\n'), true)

    expect(result).toContain(`.bg-brand { background-color: var(${property}); }`)
    expect(result).toContain(`.theme-dark { ${property}: #00f; }`)
    expect(result).not.toContain('.bg-brand { background-color: #f00; }')
    expect(result).not.toContain('oklch(')
  })

  it.each([
    ['a mixed root selector', ':root, .theme-dark { --color-brand: #00f; }'],
    ['a conditional root rule', '@media (prefers-color-scheme: dark) { :root { --color-brand: #00f; } }'],
    ['an important root declaration', ':root { --color-brand: #00f !important; }'],
    ['a repeated root declaration', ':root { --color-brand: #f00; } :root { --color-brand: #00f; }'],
  ])('preserves var() with %s', (_name, override) => {
    const result = transformWebCssCompat([
      ':root { --color-brand: #f00; }',
      override,
      '.bg-brand { background-color: var(--color-brand); }',
    ].join('\n'), true)

    expect(result).toContain('.bg-brand { background-color: var(--color-brand); }')
  })

  it('only inlines aliases whose complete root dependency chain is stable', () => {
    const result = transformWebCssCompat([
      ':root { --color-base: #f00; --color-alias: var(--color-base, #0f0); --color-dynamic: var(--runtime-brand, #0f0); }',
      '.theme-dark { --runtime-brand: #00f; }',
      '.stable { background-color: var(--color-alias); }',
      '.dynamic { background-color: var(--color-dynamic); }',
    ].join('\n'), true)

    expect(result).toContain('.stable { background-color: #f00; }')
    expect(result).toContain('.dynamic { background-color: var(--color-dynamic); }')
    expect(result).toContain('--color-dynamic: var(--runtime-brand, #0f0)')
  })

  it('maps WebView utility selectors to safe class names without changing declarations', () => {
    const css = [
      '.rounded-\\[20rpx\\] { border-radius: 0.625rem; }',
      '.bg-white\\/70 { background-color: rgba(255, 255, 255, 0.7); }',
      '.text-\\[26rpx\\] { font-size: 0.8125rem; }',
      '.text-slate-700 { color: rgb(49, 65, 88); }',
      '.theme-dark .dark\\:bg-zinc-950 { background-color: rgb(9, 9, 11); }',
    ].join('\n')
    const result = transformWebCssSafeSelectors(css)

    expect(result).toContain('.rounded-_b20rpx_B')
    expect(result).toContain('.bg-white_f70')
    expect(result).toContain('.text-_b26rpx_B')
    expect(result).toContain('.text-slate-700')
    expect(result).toContain('.theme-dark .dark_cbg-zinc-950')
    expect(result).toContain('background-color: rgba(255, 255, 255, 0.7)')
  })

  it('removes Tailwind initial fallback variables that break gradient var fallbacks without @property', () => {
    const css = [
      '@property --tw-gradient-position { syntax: "*"; inherits: false; }',
      '@property --tw-gradient-stops { syntax: "*"; inherits: false; }',
      '@property --tw-gradient-via-stops { syntax: "*"; inherits: false; }',
      '@supports ((-webkit-hyphens: none) and (not (margin-trim: inline))) {',
      '  *, ::before, ::after, ::backdrop {',
      '    --tw-gradient-position: initial;',
      '    --tw-gradient-from: #0000;',
      '    --tw-gradient-via: #0000;',
      '    --tw-gradient-to: #0000;',
      '    --tw-gradient-stops: initial;',
      '    --tw-gradient-via-stops: initial;',
      '    --tw-gradient-from-position: 0%;',
      '    --tw-gradient-via-position: 50%;',
      '    --tw-gradient-to-position: 100%;',
      '  }',
      '}',
      '.bg-gradient-to-br {',
      '  --tw-gradient-position: to bottom right in oklab;',
      '  background-image: linear-gradient(var(--tw-gradient-stops));',
      '}',
      '.from-slate-900\\/95 {',
      '  --tw-gradient-from: rgba(15, 23, 43, 0.95);',
      '  --tw-gradient-stops: var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position));',
      '}',
      '.to-slate-700\\/95 {',
      '  --tw-gradient-to: rgba(49, 65, 88, 0.95);',
      '  --tw-gradient-stops: var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position));',
      '}',
    ].join('\n')
    const result = transformWebCssCompat(css, true)

    expect(result).toContain('@property')
    expect(result).not.toContain('--tw-gradient-position: initial')
    expect(result).not.toContain('--tw-gradient-stops: initial')
    expect(result).not.toContain('--tw-gradient-via-stops: initial')
    expect(result).toContain('--tw-gradient-from: #0000')
    expect(result).toContain('--tw-gradient-to: #0000')
    expect(result).toContain('--tw-gradient-position: to bottom right')
    expect(result).not.toContain('to bottom right in oklab')
    expect(result).toContain('background-image: linear-gradient(var(--tw-gradient-stops))')
    expect(result).toContain('var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from)')
  })

  it('normalizes Tailwind CSS v4 gradient interpolation hints for legacy WebView', () => {
    const css = [
      '.bg-linear {',
      '  --tw-gradient-position: in oklab;',
      '  background-image: linear-gradient(var(--tw-gradient-stops));',
      '}',
      '.bg-radial {',
      '  --tw-gradient-position: in oklab;',
      '  background-image: radial-gradient(var(--tw-gradient-stops));',
      '}',
      '.bg-conic {',
      '  --tw-gradient-position: in oklab;',
      '  background-image: conic-gradient(var(--tw-gradient-stops));',
      '}',
    ].join('\n')
    const result = transformWebCssCompat(css, true)

    expect(result).not.toContain('in oklab')
    expect(result).toContain('--tw-gradient-position: to bottom')
    expect(result).toContain('--tw-gradient-position: at center')
    expect(result).toContain('--tw-gradient-position: from 0deg')
  })

  it('normalizes Tailwind CSS v4 infinity radius for legacy WebView', () => {
    const css = [
      '.rounded-full {',
      '  border-radius: calc(infinity * 1px);',
      '}',
      '.rounded-t-full {',
      '  border-top-left-radius: calc(infinity * 1px);',
      '  border-top-right-radius: calc(infinity * 1px);',
      '}',
    ].join('\n')
    const result = transformWebCssCompat(css, true)

    expect(result).toContain('border-radius: 9999px')
    expect(result).toContain('border-top-left-radius: 9999px')
    expect(result).toContain('border-top-right-radius: 9999px')
    expect(result).not.toContain('infinity')
  })

  it('targets Chrome 91 and AppleWebKit 537.36 with legacy-web compat output', () => {
    const css = [
      '@theme {',
      '  --color-slate-700: oklch(37.2% 0.044 257.287);',
      '  --color-emerald-500: oklch(69.6% 0.17 162.48);',
      '  --color-zinc-950: oklch(14.1% 0.005 285.823);',
      '  --color-red-300: oklch(80.8% 0.114 19.571);',
      '}',
      '.rounded-full { border-radius: calc(infinity * 1px); }',
      '.bg-white\\/70 { background-color: rgb(255 255 255 / 70%); }',
      '.text-slate-700 { color: var(--color-slate-700); }',
      '.bg-emerald-500 { background-color: var(--color-emerald-500); }',
      '.theme-dark .dark\\:bg-zinc-950 { background-color: var(--color-zinc-950); }',
      '.dark\\:bg-red-300.theme-dark { background-color: var(--color-red-300); }',
      '.text-\\[45rpx\\] { font-size: 45rpx; }',
      '.bg-\\[radial-gradient\\(circle_at_center\\,_#fff\\,_#000\\)\\] {',
      '  background-image: radial-gradient(circle at center, #fff, #000);',
      '}',
      '.modern-hsl { color: hsl(210 40% 96% / 75%); }',
    ].join('\n')
    const compat = transformWebCssCompat(css, true)
    const safe = transformWebCssSafeSelectors(compat)

    expect(compat).not.toContain('oklch(')
    expect(compat).not.toContain('color-mix(')
    expect(compat).not.toContain('calc(infinity')
    expect(compat).toContain('border-radius: 9999px')
    expect(compat).toMatch(/\.bg-white\\\/70 \{ background-color: rgba?\(255, 255, 255, 0\.7\); \}/)
    expect(compat).not.toContain('rgb(255 255 255 / 70%)')
    expect(compat).toContain('.text-slate-700 { color: rgb(')
    expect(compat).toContain('.bg-emerald-500 { background-color: rgb(')
    expect(compat).toContain('.theme-dark .dark\\:bg-zinc-950 { background-color: rgb(')
    expect(compat).toContain('.dark\\:bg-red-300.theme-dark { background-color: rgb(')
    expect(compat).toContain('.text-\\[45rpx\\] { font-size: 45rpx; }')
    expect(compat).toContain('background-image: radial-gradient(circle at center, #fff, #000)')
    expect(compat).toMatch(/\.modern-hsl \{ color: rgba?\(/)
    expect(compat).not.toContain('hsl(210 40% 96% / 75%)')

    expect(safe).toContain('.bg-white_f70')
    expect(safe).toContain('.text-_b45rpx_B')
    expect(safe).toContain('.theme-dark .dark_cbg-zinc-950')
    expect(safe).toContain('.dark_cbg-red-300.theme-dark')
    expect(safe).toContain('background-image: radial-gradient(circle at center, #fff, #000)')
  })

  it('preserves CSS custom properties for the Chrome 91 and AppleWebKit 537.36 baseline', () => {
    const css = [
      ':root {',
      '  --app-accent: rgb(16, 185, 129);',
      '  --app-size: 45px;',
      '}',
      '.css-variable-probe {',
      '  background-color: var(--app-accent);',
      '  font-size: var(--app-size);',
      '}',
    ].join('\n')
    const result = transformWebCssCompat(css, true)

    expect(result).toContain('--app-accent: rgb(16, 185, 129)')
    expect(result).toContain('--app-size: 45px')
    expect(result).toContain('background-color: var(--app-accent)')
    expect(result).toContain('font-size: var(--app-size)')
  })

  it('preserves element-scoped shadow color variables across utilities', () => {
    const css = [
      ':root {',
      '  --color-red-500: oklch(63.7% 0.237 25.331);',
      '  --color-teal-600: oklch(60% 0.118 184.704);',
      '  .nested-shadow { --tw-shadow-color: var(--color-teal-600); }',
      '}',
      '@property --tw-shadow-color { syntax: "*"; inherits: false; initial-value: initial; }',
      '@property --tw-shadow-alpha { syntax: "<percentage>"; inherits: false; initial-value: 100%; }',
      '.shadow-lg {',
      '  --tw-shadow: 0 10px 15px -3px var(--tw-shadow-color, rgb(0 0 0 / 0.1));',
      '  box-shadow: var(--tw-shadow);',
      '}',
      '.shadow-red-500 { --tw-shadow-color: var(--color-red-500); }',
      '.shadow-teal-600\\/20 {',
      '  --tw-shadow-color: color-mix(in oklab, var(--color-teal-600) 20%, transparent);',
      '}',
    ].join('\n')
    const result = transformWebCssCompat(css, true)

    expect(result).toContain('--tw-shadow: 0 10px 15px -3px var(--tw-shadow-color, rgba(0, 0, 0, 0.1))')
    expect(result).toContain('box-shadow: var(--tw-shadow)')
    expect(result).toContain('.shadow-red-500 { --tw-shadow-color: rgb(251, 44, 54); }')
    expect(result).toContain('.shadow-teal-600\\/20 {')
    expect(result).toContain('--tw-shadow-color: rgba(0, 148, 136, 0.2)')
    expect(result).not.toContain('--tw-shadow: 0 10px 15px -3px rgba(0, 148, 136, 0.2)')
  })

  it('preserves Tailwind registered property initial values as web compat fallbacks', () => {
    const css = [
      '@property --tw-border-style { syntax: "*"; inherits: false; initial-value: solid; }',
      '@property --tw-shadow { syntax: "*"; inherits: false; initial-value: 0 0 #0000; }',
      '@property --tw-gradient-stops { syntax: "*"; inherits: false; }',
      '@supports ((-webkit-hyphens: none) and (not (margin-trim: inline))) {',
      '  *, ::before, ::after, ::backdrop {',
      '    --tw-border-style: solid;',
      '    --tw-shadow: 0 0 #0000;',
      '    --tw-gradient-stops: initial;',
      '  }',
      '}',
      '.border { border-style: var(--tw-border-style); border-width: 1px; }',
      '.shadow { box-shadow: var(--tw-shadow); }',
      '.bg-gradient { background-image: linear-gradient(var(--tw-gradient-stops)); }',
    ].join('\n')
    const result = transformWebCssCompat(css, true)

    expect(result).toContain('@property')
    expect(result).toContain('*, ::before, ::after, ::backdrop')
    expect(result).toContain('--tw-border-style: solid')
    expect(result).toContain('--tw-shadow: 0 0 #0000')
    expect(result).not.toContain('--tw-gradient-stops: initial')
    expect(result).toContain('border-style: var(--tw-border-style)')
    expect(result).toContain('box-shadow: var(--tw-shadow)')
  })

  it('removes known Tailwind initial fallback variables when dev css chunks no longer contain @property rules', () => {
    const css = [
      '@supports ((-webkit-hyphens: none) and (not (margin-trim: inline))) {',
      '  *, ::before, ::after, ::backdrop {',
      '    --tw-gradient-position: initial;',
      '    --tw-gradient-from: #0000;',
      '    --tw-gradient-via: #0000;',
      '    --tw-gradient-to: #0000;',
      '    --tw-gradient-stops: initial;',
      '    --tw-gradient-via-stops: initial;',
      '    --tw-leading: initial;',
      '    --tw-font-weight: initial;',
      '    --tw-tracking: initial;',
      '    --tw-shadow-color: initial;',
      '  }',
      '}',
      '.bg-gradient-to-br {',
      '  --tw-gradient-position: to bottom right in oklab;',
      '  background-image: linear-gradient(var(--tw-gradient-stops));',
      '}',
    ].join('\n')
    const result = transformWebCssCompat(css, true)

    expect(result).not.toContain('--tw-gradient-position: initial')
    expect(result).not.toContain('--tw-gradient-stops: initial')
    expect(result).not.toContain('--tw-gradient-via-stops: initial')
    expect(result).not.toContain('--tw-leading: initial')
    expect(result).not.toContain('--tw-font-weight: initial')
    expect(result).not.toContain('--tw-tracking: initial')
    expect(result).toContain('--tw-shadow-color: initial')
    expect(result).toContain('--tw-gradient-from: #0000')
    expect(result).toContain('--tw-gradient-position: to bottom right')
    expect(result).not.toContain('to bottom right in oklab')
    expect(result).toContain('background-image: linear-gradient(var(--tw-gradient-stops))')
  })

  it('snapshots web and web compat css output differences', () => {
    const web = [
      '@theme {',
      '  --color-blue-500: oklch(62.3% .214 259.815);',
      '  --shadow-card: 0 8px 24px color-mix(in oklab, var(--color-blue-500) 18%, transparent);',
      '  @keyframes enter { from { opacity: 0; } to { opacity: 1; } }',
      '}',
      '@layer utilities {',
      '  .text-blue { color: var(--color-blue-500); }',
      '  .shadow-card { box-shadow: var(--shadow-card); }',
      '}',
      '@property --tw-rotate-x { syntax: "*"; inherits: false; initial-value: 0; }',
      '@supports (color: color-mix(in lab, red, red)) {',
      '  .bg-blue\\/50 { background-color: color-mix(in oklab, var(--color-blue-500) 50%, transparent); }',
      '}',
    ].join('\n')
    const webCompat = transformWebCssCompat(web, true)

    expect({
      web,
      webCompat,
    }).toMatchSnapshot()
  })

  it('hoists non-declaration theme nodes outside root rule', () => {
    const css = '@theme { --color-blue-500: oklch(62.3% .214 259.815); @keyframes enter { to { opacity: 1; } } }'
    const result = transformWebCssCompat(css, { features: { theme: true, oklch: true } })

    expect(result).toContain(':root')
    expect(result).toContain('--color-blue-500: rgb(')
    expect(result).toContain('@keyframes enter')
    expect(result).not.toContain(':root {\n    @keyframes')
  })

  it('removes empty theme rules and preserves theme at-rules without root declarations', () => {
    expect(transformWebCssCompat('@theme {}', { features: { theme: true } })).toBe('')
    expect(transformWebCssCompat('@theme { @keyframes enter { to { opacity: 1; } } }', {
      features: {
        theme: true,
      },
    }).trim()).toBe('@keyframes enter { to { opacity: 1; } }')
  })

  it('allows feature-level overrides', () => {
    const css = [
      '@theme { --color-blue-500: oklch(62.3% .214 259.815); }',
      '@property --tw-rotate-x { syntax: "*"; inherits: false; }',
    ].join('\n')
    const result = transformWebCssCompat(css, {
      preset: 'legacy-web',
      features: {
        theme: false,
      },
    })

    expect(result).toContain('@theme')
    expect(result).toContain('@property')
  })

  it('supports individual feature switches', () => {
    const css = [
      '@supports (display: grid) { .grid { display: grid; } }',
      '@supports (color: color-mix(in lab, red, red)) { .mix { color: color-mix(in oklab, red 50%, transparent); } }',
      '.plain { color: rgb(255 0 0 / 50%); }',
      '.modern { color: oklch(62.3% .214 259.815); }',
      '.mix2 { color: color-mix(in srgb, red 50%, transparent); }',
    ].join('\n')

    const keepSupports = transformWebCssCompat(css, {
      features: {
        supports: false,
        colorFunctions: true,
        oklch: true,
      },
    })
    const keepModernColors = transformWebCssCompat(css, {
      features: {
        supports: true,
        colorFunctions: false,
        oklch: false,
      },
    })

    expect(keepSupports).toContain('@supports (display: grid)')
    expect(keepSupports).toContain('@supports (color: color-mix')
    expect(keepSupports).toContain('color: rgb(')
    expect(keepSupports).not.toContain('color: oklch(')
    expect(keepModernColors).toContain('@supports (display: grid)')
    expect(keepModernColors).not.toContain('@supports (color: color-mix')
    expect(keepModernColors).toContain('oklch(')
    expect(keepModernColors).toContain('color-mix(')
  })

  it('does not downgrade non-oklch color functions when color functions are disabled', () => {
    const css = '.mix { color: color-mix(in srgb, red 50%, transparent); }'
    const result = transformWebCssCompat(css, {
      features: {
        oklch: true,
        colorFunctions: false,
      },
    })

    expect(result).toBe(css)
  })

  it('can normalize colors without changing layer or property at-rules', () => {
    const css = [
      '@layer utilities { .text-blue { color: oklch(62.3% .214 259.815); } }',
      '@property --tw-rotate-x { syntax: "*"; inherits: false; }',
    ].join('\n')
    const result = transformWebCssCompat(css, {
      preset: 'off',
      features: {
        oklch: true,
      },
    })

    expect(result).toContain('@layer')
    expect(result).toContain('@property')
    expect(result).toContain('color: rgb(')
    expect(result).not.toContain('color: oklch(')
  })

  it('removes empty modern supports and empty layer at-rules', () => {
    const css = [
      '@supports (color: oklch(0% 0 0)) {}',
      '@layer utilities {}',
      '@media (min-width: 768px) {}',
    ].join('\n')

    expect(transformWebCssCompat(css, {
      features: {
        layer: true,
        supports: true,
      },
    })).toBe('')
  })

  it('falls back to original css when parsing fails', () => {
    const css = '@layer utilities { .broken { color: red; }'

    expect(transformWebCssCompat(css, true)).toBe(css)
  })

  it('normalizes option presets', () => {
    expect(normalizeWebCssCompatOptions(undefined)).toMatchObject({
      preset: 'off',
      features: {
        layer: false,
      },
    })
    expect(normalizeWebCssCompatOptions(true)).toMatchObject({
      preset: 'legacy-web',
      features: {
        layer: true,
        property: true,
      },
    })
    expect(normalizeWebCssCompatOptions({
      preset: 'off',
      features: {
        property: true,
      },
    })).toMatchObject({
      preset: 'off',
      features: {
        layer: false,
        property: true,
      },
    })
  })
})
