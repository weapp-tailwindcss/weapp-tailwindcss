import { describe, expect, it } from 'vitest'
import { createStyleHandler, finalizeMiniProgramCss, normalizeMiniProgramGeneratedCssForPostcss, pruneMiniProgramGeneratedCss, repairTrailingUnclosedTailwindSourceMedia } from '../src'

describe('mini-program generated css cleanup', () => {
  it('preserves statement at-rules while removing empty block at-rules', () => {
    const css = finalizeMiniProgramCss([
      '@charset "UTF-8";',
      '@import "./third-party-ui.wxss";',
      '@supports (display:grid) { /* empty */ }',
      '.card{display:flex}',
    ].join('\n'), {
      isTailwindcssV4: true,
    })

    expect(css).toContain('@charset "UTF-8";')
    expect(css).toContain('@import "./third-party-ui.wxss";')
    expect(css).not.toContain('@supports')
    expect(css).toContain('.card{display:flex}')
  })

  it('removes cascade layer declarations and unwraps layer blocks in final mini-program css', () => {
    const css = finalizeMiniProgramCss([
      '@layer theme, base, components, utilities;',
      '@layer utilities {',
      '.text-red-500{color:red}',
      '}',
      '@media (min-width: 768px) {',
      '@layer utilities {',
      '.md\\:block{display:block}',
      '}',
      '}',
    ].join('\n'), {
      isTailwindcssV4: true,
    })

    expect(css).not.toContain('@layer')
    expect(css).toContain('.text-red-500{color:red}')
    expect(css).toContain('@media (min-width: 768px)')
    expect(css).toContain('.md\\:block{display:block}')
  })

  it('unwraps Tailwind source media markers in final mini-program css', () => {
    const css = finalizeMiniProgramCss([
      '@media source(none) {',
      'view,text,::after,::before{box-sizing:border-box}',
      '}',
      '@media (min-width: 768px) {',
      '.md\\:block{display:block}',
      '}',
    ].join('\n'), {
      isTailwindcssV4: true,
    })

    expect(css).not.toContain('@media source(none)')
    expect(css).toContain('view,text,::after,::before{box-sizing:border-box}')
    expect(css).toContain('@media (min-width: 768px)')
    expect(css).toContain('.md\\:block{display:block}')
  })

  it('does not synthesize pseudo content init in final mini-program css', () => {
    const css = finalizeMiniProgramCss([
      ':host,page,.tw-root,wx-root-portal-content {',
      '  --color-red-500: red;',
      '}',
      '.bg-red-500 {',
      '  background-color: var(--color-red-500);',
      '}',
    ].join('\n'))

    expect(css).not.toContain('--tw-content')
    expect(css).toContain(':host,page,.tw-root,wx-root-portal-content')
    expect(css).toContain('background-color: var(--color-red-500)')
  })

  it('keeps Tailwind v4 content init when content variable is used', () => {
    const css = finalizeMiniProgramCss([
      '::before,::after{--tw-content:""}',
      ':host,page,.tw-root,wx-root-portal-content {',
      '  --tw-content: "";',
      '  --color-red-500: red;',
      '}',
      '.before\\:content-\\[\\\"x\\\"\\]::before {',
      '  --tw-content: "x";',
      '  content: var(--tw-content);',
      '}',
    ].join('\n'), {
      isTailwindcssV4: true,
    })

    expect(css).not.toContain('::before,::after{--tw-content:""}')
    expect(css).toMatch(/view,text,::after,::before\s*\{\s*--tw-content:\s*""/)
    expect(css).toContain('--tw-content: "x"')
    expect(css).toContain('content: var(--tw-content)')
    expect(css).toContain('--color-red-500: red')
  })

  it('keeps Tailwind v4 content default in non-main generated chunks without reset', async () => {
    const styleHandler = createStyleHandler({
      majorVersion: 4,
    })
    const { css } = await styleHandler('.after_cborder-none::after{border-style:none;content:var(--tw-content)}', {
      isMainChunk: false,
    })

    expect(css).toMatch(/view,text,::after,::before\s*\{\s*--tw-content:\s*""/)
    expect(css).toContain('.after_cborder-none::after{border-style:none;content:var(--tw-content)}')
    expect(css).not.toContain('box-sizing:border-box')
  })

  it('removes empty conditional at-rules from generated mini-program css', () => {
    const css = finalizeMiniProgramCss([
      '@media (prefers-color-scheme: light) {}',
      '@media (prefers-color-scheme: dark) { /* removed declarations */ }',
      '@media screen { @supports (display: grid) {} }',
      '.keep{color:red}',
    ].join('\n'), { isTailwindcssV4: true })

    expect(css).not.toContain('@media')
    expect(css).not.toContain('@supports')
    expect(css).toContain('.keep{color:red}')
  })

  it('removes empty standard declarations generated from Tailwind v4 custom property fallbacks', () => {
    const css = finalizeMiniProgramCss([
      ':host,page,.tw-root,wx-root-portal-content{--tw-blur: ;--tw-backdrop-blur: ;}',
      '.blur-3xl{--tw-blur:blur(64px);filter: ;filter:var(--tw-blur,) var(--tw-brightness,)}',
      '.backdrop-blur-sm{--tw-backdrop-blur:blur(8px);backdrop-filter: ;backdrop-filter:var(--tw-backdrop-blur,) var(--tw-backdrop-brightness,)}',
      '.transform{transform: }',
      '.legacy{legacy:/* uni variables */}',
    ].join('\n'), { isTailwindcssV4: true })

    expect(css).toMatch(/--tw-blur:\s*;/)
    expect(css).toMatch(/--tw-backdrop-blur:\s*;/)
    expect(css).toMatch(/filter:var\(--tw-blur,\s*\) var\(--tw-brightness,\s*\)/)
    expect(css).toMatch(/backdrop-filter:var\(--tw-backdrop-blur,\s*\) var\(--tw-backdrop-brightness,\s*\)/)
    expect(css).not.toMatch(/(?:^|[;{])\s*(?:backdrop-)?filter:\s*;/)
    expect(css).not.toContain('.transform')
    expect(css).toContain('legacy:/* uni variables */')
  })

  it('preserves user page custom properties that use Tailwind v4 theme namespaces', async () => {
    const styleHandler = createStyleHandler({
      majorVersion: 4,
    })
    const { css } = await styleHandler([
      'page{',
      '--test-color:#006241;',
      '--color-test:#006241;',
      '--font-test:sans-serif;',
      '}',
    ].join(''))

    expect(css).toContain('page{')
    expect(css).toContain('--test-color:#006241')
    expect(css).toContain('--color-test:#006241')
    expect(css).toContain('--font-test:sans-serif')
  })

  it('keeps pseudo scoped content init before element variable scope pruning', () => {
    const css = pruneMiniProgramGeneratedCss([
      '::before,::after{--tw-content:""}',
      'view,text,::after,::before{--tw-border-spacing-x:0}',
    ].join('\n'), {
      preservePreflight: true,
    })

    expect(css).toContain('::before,::after{--tw-content:""}')
    expect(css).toContain('view,text,::after,::before{--tw-border-spacing-x:0}')
    expect(css).not.toContain('view,text,::after,::before{--tw-content')
  })

  it('drops element scoped content init when pruning generated css without preflight', () => {
    const css = pruneMiniProgramGeneratedCss('view,text,::after,::before{--tw-content:\'\'}')

    expect(css).toBe('')
  })

  it('does not restore element content carriers after uvue finalization', () => {
    const css = pruneMiniProgramGeneratedCss([
      'view,text,::after,::before{--tw-content:""}',
      '.before-probe::before{--tw-content:"probe";content:var(--tw-content)}',
    ].join('\n'), {
      preserveContentInit: false,
      preservePreflight: true,
    })

    expect(css).toContain('.before-probe::before')
    expect(css).not.toContain('view,text')
    expect(css).not.toContain('::after{--tw-content:""}')
  })

  it('keeps injected mini-program preflight before runtime variables', async () => {
    const styleHandler = createStyleHandler({
      cssPreflight: {
        'box-sizing': 'border-box',
        'border-width': '0',
        'border-style': 'solid',
        'border-color': 'currentColor',
      },
      cssSelectorReplacement: {
        universal: ['view', 'text'],
      },
    })
    const { css } = await styleHandler('::before,::after{--tw-border-spacing-x:0;--tw-border-spacing-y:0}')

    expect(css).toContain('view,text,::before,::after{box-sizing:border-box;border-width:0;border-style:solid;border-color:currentColor;--tw-border-spacing-x:0')
  })

  it('keeps hoisted mini-program preflight in the same element scope as runtime variables', () => {
    const css = finalizeMiniProgramCss([
      'view,text,::after,::before{--tw-border-spacing-x:0;--tw-border-spacing-y:0}',
      'view,text,::after,::before{box-sizing:border-box;border-width:0;border-style:solid;border-color:currentColor}',
    ].join('\n'))

    expect(css).toContain('view,text,::after,::before{box-sizing:border-box;border-width:0;border-style:solid;border-color:currentColor;--tw-border-spacing-x:0;--tw-border-spacing-y:0')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-border-spacing-x:0')
  })

  it('removes Tailwind v4 content init when content variable is unused', () => {
    const css = finalizeMiniProgramCss([
      ':host,page,.tw-root,wx-root-portal-content {',
      '  --tw-content: "";',
      '  --color-red-500: red;',
      '}',
      '.bg-red-500 { background-color: var(--color-red-500); }',
    ].join('\n'))

    expect(css).not.toContain('--tw-content')
    expect(css).toContain('--color-red-500: red')
    expect(css).toContain('background-color: var(--color-red-500)')
  })

  it('keeps Tailwind v4 property defaults after removing @property rules', () => {
    const css = finalizeMiniProgramCss([
      '/*! tailwindcss v4.1.10 | MIT License | https://tailwindcss.com */',
      '.border{border-style:var(--tw-border-style);border-width:1px}',
      '@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}',
    ].join(''))

    expect(css).toContain('view,text,::after,::before{--tw-border-style:solid}')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-border-style:solid}')
    expect(css).toContain('.border{border-style:var(--tw-border-style);border-width:1px}')
    expect(css).not.toContain('@property')
  })

  it('merges mini-program preflight reset with Tailwind v4 property defaults', () => {
    const css = finalizeMiniProgramCss([
      '/*! tailwindcss v4.1.10 | MIT License | https://tailwindcss.com */',
      '.border{border-style:var(--tw-border-style);border-width:1px}',
      '@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}',
    ].join(''), {
      cssPreflight: {
        'box-sizing': 'border-box',
        margin: '0',
        padding: '0',
        border: '0 solid',
      },
    })

    expect(css.match(/view,text,::after,::before\{/g)).toHaveLength(1)
    expect(css).toContain('view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid;--tw-border-style:solid}')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-border-style:solid}')
  })

  it('does not synthesize mini-program reset when cssPreflight is disabled', () => {
    const css = finalizeMiniProgramCss([
      '/*! tailwindcss v4.1.10 | MIT License | https://tailwindcss.com */',
      '.border{border-style:var(--tw-border-style);border-width:1px}',
      '@property --tw-border-style{syntax:"*";inherits:false;initial-value:solid}',
    ].join(''), {
      cssPreflight: false,
      isTailwindcssV4: true,
    })

    expect(css).toContain('view,text,::after,::before{--tw-border-style:solid}')
    expect(css).not.toContain('box-sizing:border-box')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-border-style:solid}')
    expect(css).toContain('.border{border-style:var(--tw-border-style);border-width:1px}')
  })

  it('drops collected Tailwind v4 reset but keeps runtime defaults when cssPreflight is disabled', () => {
    const css = finalizeMiniProgramCss([
      '/*! tailwindcss v4.1.10 | MIT License | https://tailwindcss.com */',
      'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid;--tw-border-style:solid}',
      '.border{border-style:var(--tw-border-style);border-width:1px}',
    ].join(''), {
      cssPreflight: false,
      isTailwindcssV4: true,
    })

    expect(css).toContain('view,text,::after,::before{--tw-border-style:solid}')
    expect(css).not.toContain('box-sizing:border-box')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-border-style:solid}')
    expect(css).toContain('.border{border-style:var(--tw-border-style);border-width:1px}')
  })

  it('keeps configured preflight in the same element scope as Tailwind v4 runtime variables', () => {
    const css = finalizeMiniProgramCss([
      '/*! tailwindcss v4.1.10 | MIT License | https://tailwindcss.com */',
      'view,text,::after,::before{--tw-space-y-reverse:0;--tw-border-style:solid}',
      '.space-y-2>view+view{--tw-space-y-reverse:0;margin-top:calc(var(--spacing)*2)}',
    ].join(''), {
      cssPreflight: {
        'box-sizing': 'border-box',
        margin: '0',
        padding: '0',
        border: '0 solid',
      },
      isTailwindcssV4: true,
    })

    expect(css).toContain('view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid;--tw-space-y-reverse:0;--tw-border-style:solid}')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-space-y-reverse:0')
    expect(css).toContain('.space-y-2>view+view')
  })

  it('keeps Tailwind v4 property defaults out of existing preflight in style handler output', async () => {
    const styleHandler = createStyleHandler({
      cssPreflight: {
        'box-sizing': 'border-box',
        margin: '0',
        padding: '0',
        border: '0 solid',
      },
      cssRemoveProperty: true,
      majorVersion: 4,
    })
    const { css } = await styleHandler([
      'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
      '.rotate-x{transform:var(--tw-rotate-x)var(--tw-rotate-y)}',
      '@property --tw-rotate-x{syntax:"*";inherits:false;initial-value:}',
      '@property --tw-rotate-y{syntax:"*";inherits:false;initial-value:}',
    ].join(''))

    expect(css.match(/view,text,::after,::before\{/g)).toHaveLength(1)
    expect(css).toContain('view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid;--tw-rotate-x:;--tw-rotate-y:;}')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-rotate-x:;--tw-rotate-y:}')
    expect(css).toContain('.rotate-x{transform:var(--tw-rotate-x)var(--tw-rotate-y)}')
    expect(css).not.toContain('@property')
  })

  it('dedupes repeated Tailwind v4 preflight declarations when hoisted rules are merged', () => {
    const css = finalizeMiniProgramCss([
      '/*! tailwindcss v4.1.10 | MIT License | https://tailwindcss.com */',
      'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid;--tw-gradient-position:initial}',
      'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid;--tw-border-style:solid}',
      '.border{border-style:var(--tw-border-style);border-width:1px}',
    ].join(''), {
      cssPreflight: {
        'box-sizing': 'border-box',
        margin: '0',
        padding: '0',
        border: '0 solid',
      },
      isTailwindcssV4: true,
    })

    expect(css.match(/view,text,::after,::before\{/g)).toHaveLength(1)
    expect(css.match(/box-sizing:border-box/g)).toHaveLength(1)
    expect(css.match(/margin:0/g)).toHaveLength(1)
    expect(css.match(/padding:0/g)).toHaveLength(1)
    expect(css.match(/border:0 solid/g)).toHaveLength(1)
    expect(css).toContain('view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid;--tw-gradient-position:initial;--tw-border-style:solid')
  })

  it('applies configured preflight overrides to collected Tailwind v4 base rules', () => {
    const css = finalizeMiniProgramCss([
      '/*! tailwindcss v4.1.10 | MIT License | https://tailwindcss.com */',
      'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
      '.border-solid{--tw-border-style:solid;border-style:solid}',
    ].join(''), {
      cssPreflight: {
        'box-sizing': 'border-box',
        margin: '0',
        padding: '0',
        border: false,
        'border-width': '0',
        'border-style': false,
      },
      isTailwindcssV4: true,
    })

    expect(css).toContain('view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border-width:0;--tw-border-style:solid')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-border-style:solid')
    expect(css).not.toContain('border:0 solid')
    expect(css).toContain('.border-solid{--tw-border-style:solid;border-style:solid}')
  })

  it('removes Tailwind v4 source directives from final mini-program css', () => {
    const css = finalizeMiniProgramCss([
      '/* uni variables */',
      '@media source(none){',
      '/*! weapp-tailwindcss generator-placeholder */',
      '}',
      '@media source("./App.uvue"){}',
      '@config "./tailwind.config.js";',
      '@source "./App.uvue";',
      '@source not "./unpackage/**/*";',
      '.w-_b100px_B{width:100px}',
    ].join('\n'), {
      isTailwindcssV4: true,
    })

    expect(css).toContain('/* uni variables */')
    expect(css).toContain('.w-_b100px_B{width:100px}')
    expect(css).not.toContain('@media source(none)')
    expect(css).not.toContain('generator-placeholder')
    expect(css).not.toContain('@config')
    expect(css).not.toContain('@source')
    expect(css).not.toMatch(/^\s*\}\s*$/m)
  })

  it('strictly repairs only a trailing unclosed Tailwind source media marker', () => {
    expect(repairTrailingUnclosedTailwindSourceMedia('.keep{color:red}\n@media source(none) {\r\n')).toBe('.keep{color:red}')
    expect(repairTrailingUnclosedTailwindSourceMedia('@media source("./src") {\n')).toBe('')
    expect(repairTrailingUnclosedTailwindSourceMedia('@media screen {\n')).toBe('@media screen {\n')
    expect(repairTrailingUnclosedTailwindSourceMedia('.keep{color:red}\n@media source(none) { /* comment */')).toBe('.keep{color:red}\n@media source(none) { /* comment */')
    expect(repairTrailingUnclosedTailwindSourceMedia('.keep{color:red}\n@media source("./src") {\n.next{color:blue}')).toBe('.keep{color:red}\n@media source("./src") {\n.next{color:blue}')
    expect(repairTrailingUnclosedTailwindSourceMedia('.keep{color:red}\n@media source("./src) {\n')).toBe('.keep{color:red}\n@media source("./src) {\n')
    expect(repairTrailingUnclosedTailwindSourceMedia('.keep{color:red}\n@media source(url("./src")) {\n')).toBe('.keep{color:red}')
    expect(repairTrailingUnclosedTailwindSourceMedia('/*\n@media source(none) {\n')).toBe('/*\n@media source(none) {\n')
  })

  it('repairs trailing source media before PostCSS finalization', () => {
    const css = finalizeMiniProgramCss([
      '@media screen {}',
      '.keep{color:red}',
      '@media source(none) {\n',
    ].join('\n'), { isTailwindcssV4: true })

    expect(css).toBe('.keep{color:red}')
  })

  it('synthesizes configured mini-program preflight when generator css misses base reset', () => {
    const css = finalizeMiniProgramCss([
      '.divide-x-4>view+view{border-left-width:4px}',
      '.divide-double>view+view{border-style:double}',
    ].join('\n'), {
      cssPreflight: {
        'box-sizing': 'border-box',
        margin: '0',
        padding: '0',
        border: '0 solid',
      },
    })

    expect(css).toContain('view,text,::after,::before')
    expect(css).toContain('box-sizing:border-box')
    expect(css).toContain('margin:0')
    expect(css).toContain('padding:0')
    expect(css).toContain('border:0 solid')
    expect(css).toContain('.divide-double>view+view{border-style:double}')
  })

  it('does not synthesize mini-program preflight when cssPreflight is disabled', () => {
    const css = finalizeMiniProgramCss('.divide-double>view+view{border-style:double}', {
      cssPreflight: false,
    })

    expect(css).not.toContain('view,text,::after,::before')
    expect(css).not.toContain('border:0 solid')
    expect(css).toContain('.divide-double>view+view{border-style:double}')
  })

  it('removes Tailwind container max-width media rules from final mini-program css', () => {
    const css = finalizeMiniProgramCss([
      '.container{width:100%}',
      '@media (min-width:40rem){.container{max-width:40rem}}',
      '@media (min-width:48rem){.container{max-width:48rem}}',
      '@media (min-width:64rem){.container{max-width:64rem}}',
      '@media (min-width:80rem){.container{max-width:80rem}}',
      '@media (min-width:96rem){.container{max-width:96rem}}',
      '@media (min-width:40rem){.container{padding-left:16px;max-width:40rem}}',
    ].join(''))

    expect(css).toContain('.container{width:100%}')
    expect(css).toContain('@media (min-width:40rem){.container{padding-left:16px;max-width:40rem}}')
    expect(css).not.toContain('.container{max-width:40rem}')
    expect(css).not.toContain('.container{max-width:48rem}')
    expect(css).not.toContain('.container{max-width:64rem}')
    expect(css).not.toContain('.container{max-width:80rem}')
    expect(css).not.toContain('.container{max-width:96rem}')
  })

  it('removes traced Tailwind generated container width from final mini-program css', () => {
    const css = finalizeMiniProgramCss([
      '/* tokens: container <= <tailwind generated> */',
      '.container{width:100%}',
      '.user-container{width:100%}',
    ].join('\n'))

    expect(css).not.toContain('tokens: container <= <tailwind generated>')
    expect(css).not.toContain('.container{width:100%}')
    expect(css).toContain('.user-container{width:100%}')
  })

  it('preserves user authored container width in final mini-program css', () => {
    const css = finalizeMiniProgramCss('.container{width:100%}')

    expect(css).toContain('.container{width:100%}')
  })

  it('removes empty media rules after final mini-program css cleanup', () => {
    const css = finalizeMiniProgramCss([
      '@media (min-width: 640px) {',
      '.container{max-width:640px}',
      '}',
      '@media (prefers-color-scheme: dark) {',
      '}',
      '.keep{color:red}',
    ].join('\n'))

    expect(css).not.toContain('@media (min-width: 640px)')
    expect(css).not.toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain('.keep{color:red}')
  })

  it('keeps generated utilities when pruning layer-wrapped mini-program css', () => {
    const css = pruneMiniProgramGeneratedCss([
      '@layer theme, base, components, utilities;',
      '@layer theme {',
      ':root{--color-red-500:red}',
      '}',
      '@layer utilities {',
      '.text-red-500{color:var(--color-red-500)}',
      '}',
    ].join('\n'))

    expect(css).not.toContain('@layer')
    expect(css).toContain('page,.tw-root,wx-root-portal-content,:host{--color-red-500:red}')
    expect(css).toContain('.text-red-500{color:var(--color-red-500)}')
  })

  it('keeps raw Tailwind class selectors while removing Web-only generation structure', () => {
    const css = pruneMiniProgramGeneratedCss([
      'html:not(#\\#){line-height:1.5}',
      '@layer utilities {',
      '.space-y-4:not(#\\#){',
      '  :where(& > :not(:last-child)){margin-top:calc(var(--spacing)*4)}',
      '}',
      '}',
    ].join('\n'), {
      preserveRawClassRules: true,
    })

    expect(css).not.toContain('html')
    expect(css).not.toContain('@layer')
    expect(css).not.toContain(':not(#\\#)')
    expect(css).toContain('.space-y-4{')
    expect(css).toContain(':where(& > :not(:last-child))')
    expect(css).toContain('margin-top:calc(var(--spacing)*4)')
  })

  it('flattens Tailwind nested variants before handing generated css to framework postcss', async () => {
    const css = await normalizeMiniProgramGeneratedCssForPostcss([
      '@layer utilities {',
      '.dark\\:bg-zinc-900:not(#\\#){&.theme-dark,.theme-dark &{background:black}}',
      '.system-dark\\:bg-slate-900:not(#\\#){@media (prefers-color-scheme: dark){&{background:navy}}}',
      '}',
    ].join(''), {
      preserveRawClassRules: true,
    })

    expect(css).not.toContain('@layer')
    expect(css).not.toContain(':not(#\\#)')
    expect(css).not.toContain('&')
    expect(css).toContain('.dark\\:bg-zinc-900.theme-dark')
    expect(css).toContain('.theme-dark .dark\\:bg-zinc-900')
    expect(css).toContain('@media (prefers-color-scheme: dark)')
    expect(css).toContain('.system-dark\\:bg-slate-900')
  })

  it('precomputes configured custom property calc before mini-program theme scoping', async () => {
    const css = await normalizeMiniProgramGeneratedCssForPostcss([
      ':root{--spacing:1rpx}',
      '.w-32{width:calc(var(--spacing)*32)}',
    ].join(''), {
      cssCalc: ['--spacing'],
      preservePreflight: true,
      preserveRawClassRules: true,
    })

    expect(css).toContain('width:32rpx')
    expect(css).not.toContain('calc(var(--spacing)')
    expect(css).toContain('page,.tw-root,wx-root-portal-content,:host{--spacing:1rpx}')
  })

  it('uses the full generated css as context for incremental custom property calc', async () => {
    const css = await normalizeMiniProgramGeneratedCssForPostcss(
      '.w-32{width:calc(var(--spacing)*32)}',
      {
        cssCalc: ['--spacing'],
        contextCss: ':root{--spacing:1rpx}',
        preservePreflight: true,
        preserveRawClassRules: true,
      },
    )

    expect(css).toContain('width:32rpx')
    expect(css).not.toContain('calc(var(--spacing)')
  })

  it('removes Tailwind container max-width media rules from pruned generated css', () => {
    const css = pruneMiniProgramGeneratedCss([
      '.container{width:100%}',
      '@media (min-width:40rem){.container{max-width:40rem}}',
      '@media (min-width:48rem){.container{max-width:48rem}}',
      '@media (min-width:40rem){.container{padding-left:16px;max-width:40rem}}',
    ].join(''))

    expect(css).not.toContain('.container{width:100%}')
    expect(css).toContain('@media (min-width:40rem){.container{padding-left:16px;max-width:40rem}}')
    expect(css).not.toContain('.container{max-width:40rem}')
    expect(css).not.toContain('.container{max-width:48rem}')
  })

  it('removes Tailwind generated container width from pruned generated css', () => {
    const css = pruneMiniProgramGeneratedCss([
      '.container{width:100%}',
      '.user-container{width:100%}',
    ].join(''))

    expect(css).not.toContain('.container{width:100%}')
    expect(css).toContain('.user-container{width:100%}')
  })

  it('preserves user-authored mini-program native element rules when pruning generated css', () => {
    const css = pruneMiniProgramGeneratedCss([
      'view{box-sizing:border-box;min-height:100vh;--user-view-style:1}',
      'text{box-sizing:border-box;color:inherit;--user-text-style:1}',
      '::before{box-sizing:border-box;--user-before-style:1}',
      'view,text{box-sizing:border-box;--user-group-style:1}',
      'view,text,::after,::before{color:inherit;--user-native-scope-style:1}',
      'button{box-sizing:border-box;border-radius:4px;--user-button-style:1}',
      'input{box-sizing:border-box;color:inherit;--user-input-style:1}',
      'textarea{box-sizing:border-box;min-height:120rpx;--user-textarea-style:1}',
      '@media (prefers-color-scheme: dark){view{box-sizing:border-box;--user-media-view-style:1}}',
      '@media (prefers-color-scheme: dark){button{box-sizing:border-box;--user-media-button-style:1}}',
      'view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}',
      'button,input,select,optgroup,textarea,::file-selector-button{font:inherit;color:inherit}',
      'textarea{resize:vertical}',
      'button{appearance:button}',
      '.bg-blue-500{background-color:#3b82f6}',
    ].join('\n'))

    expect(css).toContain('view{box-sizing:border-box;min-height:100vh;--user-view-style:1}')
    expect(css).toContain('text{box-sizing:border-box;color:inherit;--user-text-style:1}')
    expect(css).toContain('::before{box-sizing:border-box;--user-before-style:1}')
    expect(css).toContain('view,text{box-sizing:border-box;--user-group-style:1}')
    expect(css).toContain('view,text,::after,::before{color:inherit;--user-native-scope-style:1}')
    expect(css).toContain('button{box-sizing:border-box;border-radius:4px;--user-button-style:1}')
    expect(css).toContain('input{box-sizing:border-box;color:inherit;--user-input-style:1}')
    expect(css).toContain('textarea{box-sizing:border-box;min-height:120rpx;--user-textarea-style:1}')
    expect(css).toContain('@media (prefers-color-scheme: dark){view{box-sizing:border-box;--user-media-view-style:1}}')
    expect(css).toContain('@media (prefers-color-scheme: dark){button{box-sizing:border-box;--user-media-button-style:1}}')
    expect(css).toContain('.bg-blue-500{background-color:#3b82f6}')
    expect(css).not.toContain('view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid}')
    expect(css).not.toContain('button,input,select,optgroup,textarea,::file-selector-button{font:inherit;color:inherit}')
    expect(css).not.toContain('textarea{resize:vertical}')
    expect(css).not.toContain('button{appearance:button}')
  })

  it('preserves user-authored native element rules in final mini-program css', () => {
    const css = finalizeMiniProgramCss([
      'view{box-sizing:border-box;--user-view-style:1}',
      'text{box-sizing:border-box;--user-text-style:1}',
      'button{box-sizing:border-box;border-radius:4px;--user-button-style:1}',
      'input{box-sizing:border-box;color:inherit;--user-input-style:1}',
      'textarea{box-sizing:border-box;min-height:120rpx;--user-textarea-style:1}',
      '::after{box-sizing:border-box;--user-after-style:1}',
      '@media (prefers-color-scheme: dark){view,text{box-sizing:border-box;--user-media-native-style:1}}',
      '@media (prefers-color-scheme: dark){button{box-sizing:border-box;--user-media-button-style:1}}',
      'button,input,select,optgroup,textarea,::file-selector-button{font:inherit;color:inherit}',
      'textarea{resize:vertical}',
      'button{appearance:button}',
      '.bg-blue-500{background-color:#3b82f6}',
    ].join('\n'), {
      cssPreflight: {
        'box-sizing': 'border-box',
        margin: '0',
        padding: '0',
        border: '0 solid',
      },
      isTailwindcssV4: true,
    })

    expect(css).toContain('view{box-sizing:border-box;--user-view-style:1}')
    expect(css).toContain('text{box-sizing:border-box;--user-text-style:1}')
    expect(css).toContain('button{box-sizing:border-box;border-radius:4px;--user-button-style:1}')
    expect(css).toContain('input{box-sizing:border-box;color:inherit;--user-input-style:1}')
    expect(css).toContain('textarea{box-sizing:border-box;min-height:120rpx;--user-textarea-style:1}')
    expect(css).toContain('::after{box-sizing:border-box;--user-after-style:1}')
    expect(css).toContain('@media (prefers-color-scheme: dark){view,text{box-sizing:border-box;--user-media-native-style:1}}')
    expect(css).toContain('@media (prefers-color-scheme: dark){button{box-sizing:border-box;--user-media-button-style:1}}')
    expect(css).toContain('.bg-blue-500{background-color:#3b82f6}')
    expect(css).toContain('view,text,::after,::before{box-sizing:border-box;margin:0;padding:0;border:0 solid')
    expect(css).not.toContain('button,input,select,optgroup,textarea,::file-selector-button{font:inherit;color:inherit}')
    expect(css).not.toContain('textarea{resize:vertical}')
    expect(css).not.toContain('button{appearance:button}')
  })

  it('preserves conditional compilation comments when pruning generated css', () => {
    const css = pruneMiniProgramGeneratedCss([
      '/* #ifdef MP-WEIXIN */',
      '.bg-blue-500{color:blue}',
      '/* #endif */',
      '/* normal comment */',
    ].join('\n'), {
      preserveConditionalComments: true,
    })

    expect(css).toContain('#ifdef MP-WEIXIN')
    expect(css).toContain('#endif')
    expect(css).toContain('.bg-blue-500{color:blue}')
    expect(css).not.toContain('normal comment')
  })

  it('scopes Tailwind v4 gradient runtime defaults to mini-program element scope', () => {
    const css = pruneMiniProgramGeneratedCss([
      ':root,:host{',
      '--tw-gradient-position:initial;',
      '--tw-gradient-from:rgba(0,0,0,0);',
      '--tw-gradient-to:rgba(0,0,0,0);',
      '--tw-gradient-from-position:0%;',
      '--tw-gradient-to-position:100%;',
      '--color-amber-200:#fde68a;',
      '--color-orange-200:#fed7aa;',
      '}',
      '.bg-linear-to-r{background-image:linear-gradient(var(--tw-gradient-stops))}',
    ].join(''))

    expect(css).toContain('view,text,::after,::before{--tw-gradient-position:initial')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-gradient-position:initial')
    expect(css).toContain('--tw-gradient-from:rgba(0,0,0,0)')
    expect(css).toContain('--tw-gradient-to:rgba(0,0,0,0)')
    expect(css).toContain('--tw-gradient-from-position:0%')
    expect(css).toContain('--tw-gradient-to-position:100%')
    expect(css).toContain('page,.tw-root,wx-root-portal-content,:host{')
    expect(css).toContain('--color-amber-200:#fde68a')
    expect(css).toContain('--color-orange-200:#fed7aa')
    expect(css).toContain('.bg-linear-to-r{background-image:linear-gradient(var(--tw-gradient-stops))}')
  })

  it('keeps only mini-program useful webkit prefixes in generated css pruning', () => {
    const css = pruneMiniProgramGeneratedCss([
      '.underline{-webkit-text-decoration-line:underline;text-decoration-line:underline}',
      '.backdrop-blur-lg{-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px)}',
      '.transition{transition-property:transform,-webkit-transform}',
      '.clip{-webkit-background-clip:text;background-clip:text}',
      '.icon{-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat}',
      '.line-clamp{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;overflow:hidden}',
      '.stroke{-webkit-text-fill-color:transparent;-webkit-text-stroke-color:red}',
      '.scroll{-webkit-overflow-scrolling:touch}',
    ].join('\n'))

    expect(css).not.toContain('-webkit-text-decoration-line')
    expect(css).not.toContain('-webkit-backdrop-filter')
    expect(css).not.toContain('-webkit-transform')
    expect(css).toContain('transition-property:transform')
    expect(css).toContain('-webkit-background-clip:text')
    expect(css).toContain('-webkit-mask-repeat:no-repeat')
    expect(css).toContain('display:-webkit-box')
    expect(css).toContain('-webkit-box-orient:vertical')
    expect(css).toContain('-webkit-line-clamp:2')
    expect(css).toContain('-webkit-text-fill-color:transparent')
    expect(css).toContain('-webkit-text-stroke-color:red')
    expect(css).toContain('-webkit-overflow-scrolling:touch')
  })

  it('normalizes modern color functions out of final mini-program css', () => {
    const css = finalizeMiniProgramCss([
      ':host,page,.tw-root,wx-root-portal-content{',
      '--color-blue-500:oklch(62.3% 0.214 259.815);',
      '--color-p3:color(display-p3 0.26642 0.49122 0.98862);',
      '--color-unknown:color-mix(in oklab, var(--missing) 50%, transparent);',
      '}',
      '.text-blue-500{color:var(--color-blue-500)}',
      '.text-p3{color:color(display-p3 0.26642 0.49122 0.98862)}',
      '.bg-lab{background-color:lab(50% 40 59.5)}',
      '.bg-mix{background-color:color-mix(in oklab, var(--color-blue-500) 50%, transparent)}',
      '.bg-unknown{background-color:color-mix(in oklab, var(--missing) 50%, transparent)}',
      '@media (color-gamut: p3){.p3-only{color:color(display-p3 1 0 0)}}',
    ].join('\n'))

    expect(css).toContain('--color-blue-500:rgb(50, 128, 255)')
    expect(css).toContain('--color-p3:rgb(50, 128, 255)')
    expect(css).toContain('color:rgb(50, 128, 255)')
    expect(css).toContain('background-color:rgb(191, 87, 0)')
    expect(css).toContain('background-color:rgba(50, 128, 255, 0.5)')
    expect(css).toContain('--color-unknown:var(--missing)')
    expect(css).toContain('.bg-unknown{background-color:var(--missing)}')
    expect(css).not.toContain('color-mix')
    expect(css).not.toContain('oklab')
    expect(css).not.toContain('oklch')
    expect(css).not.toContain('lab(')
    expect(css).not.toContain('display-p3')
    expect(css).not.toContain('color-gamut')
  })
})
