import { describe, expect, it, vi } from 'vitest'
import {
  extractGeneratedCssForUserLayerSelectors,
  filterApplyOnlyGeneratedCss,
  hasUserCssLayerBlocks,
  isCommentOnlyCss,
  normalizeEmptyTailwindCustomVariants,
  removeMiniProgramHoverSelectors,
  removeMiniProgramInteractiveSelectors,
  removeTailwindV4GeneratedUserCssArtifacts,
  removeTailwindV4GeneratorAtRules,
  shouldFilterApplyOnlyGeneratedCss,
  splitUserCssLayerBlocks,
  stripTailwindSourceMediaFragments,
  stripUnmatchedTailwindSourceMediaCloseFragments,
  transformGeneratorUserCss,
} from '@/generation/user-css'

describe('generator user css helpers', () => {
  it('removes empty custom variants produced by platform preprocessors', () => {
    const source = [
      '@custom-variant wx {',
      '  /* #ifdef MP-WEIXIN */',
      '  /* #endif */',
      '}',
      '@custom-variant dark (&:where(.dark, .dark *));',
      '@custom-variant any-hover { @media (any-hover: hover) { &:hover { @slot; } } }',
      '.keep{color:red}',
    ].join('\n')
    const normalized = normalizeEmptyTailwindCustomVariants(source)

    expect(normalized).not.toContain('@custom-variant wx')
    expect(normalized).toContain('@custom-variant dark')
    expect(normalized).toContain('@custom-variant any-hover')
    expect(normalized).toContain('.keep')
    expect(normalizeEmptyTailwindCustomVariants('@custom-variant wx;\n.keep{color:red}')).toBe('.keep{color:red}')
    expect(normalizeEmptyTailwindCustomVariants('.broken{')).toBe('.broken{')
  })

  it('removes generator at-rules including fallback-unparseable blocks', () => {
    expect(removeTailwindV4GeneratorAtRules('@theme{--color-a:red}.keep{color:red}')).toBe('.keep{color:red}')
    expect(removeTailwindV4GeneratorAtRules('@source "./src"\n@theme{--color-a:red}.keep{color:red')).toContain('.keep')
    expect(removeTailwindV4GeneratorAtRules('@source "./src";.keep{color:red')).toBe('')
    expect(removeTailwindV4GeneratorAtRules('@utility btn { .nested{color:red} }\n.keep{color:blue}')).toBe('.keep{color:blue}')
    expect(removeTailwindV4GeneratorAtRules('@theme .broken{color:red')).toBe('')
    expect(removeTailwindV4GeneratorAtRules('@media source("./src") { .hidden{color:red} }\n.keep{color:blue}')).toBe('.keep{color:blue}')
    expect(removeTailwindV4GeneratorAtRules('@theme; .keep{color:red')).toBe('')
    expect(removeTailwindV4GeneratorAtRules('@source "./src"; @utility btn; .keep{color:red')).toBe('')
    expect(removeTailwindV4GeneratorAtRules('.keep{color:red}')).toBe('.keep{color:red}')
    expect(removeTailwindV4GeneratorAtRules('@source url("./{src}") @theme{--a:1}\n.keep{color:red')).toContain('.keep')
    expect(removeTailwindV4GeneratorAtRules('@media source("./src") {')).toBe('')
    expect(removeTailwindV4GeneratorAtRules('@source "src"; .keep{color:red')).toBe('')
  })

  it('strips source media fragments and unmatched close fragments', () => {
    expect(stripTailwindSourceMediaFragments([
      '@source "./src"',
      '@theme{--color-a:red}',
      '@media source(none) {',
      '.hidden{display:none}',
      '} /* source(none) */',
      '.keep{display:block}',
    ].join('\n'))).toContain('.keep')
    expect(stripTailwindSourceMediaFragments('@source "./src"\n@theme{--color-a:red}')).toBe('')
    expect(stripTailwindSourceMediaFragments('@source not-block { .hidden{display:none} }\n.keep{display:block}')).toBe('\n.keep{display:block}')
    expect(stripTailwindSourceMediaFragments('@source-media{color:red}\n.keep{display:block}')).toBe('@source-media{color:red}\n.keep{display:block}')
    expect(stripTailwindSourceMediaFragments('@source "./src"\n.keep{display:block}')).toBe('')
    expect(stripTailwindSourceMediaFragments('@source url("./src@x") @theme{--a:1}')).toBe('')
    expect(stripTailwindSourceMediaFragments('@source url("./src\\\\@x") @theme{--a:1}')).toBe('')
    expect(stripTailwindSourceMediaFragments('@source "./src";\n.keep{display:block}')).toBe('@source "./src";\n.keep{display:block}')
    expect(stripTailwindSourceMediaFragments('@source not-block; .keep{display:block}')).toBe('@source not-block; .keep{display:block}')
    expect(stripTailwindSourceMediaFragments('@source "./src" @theme{--color-a:red}.keep{display:block}')).toBe('.keep{display:block}')
    expect(stripTailwindSourceMediaFragments('@source url("./src") @utility btn { color: red }\n.keep{display:block}')).toBe('\n.keep{display:block}')
    expect(stripTailwindSourceMediaFragments('@source url("./src") { .hidden{display:none} }\n.keep{display:block}')).toBe('\n.keep{display:block}')
    expect(stripTailwindSourceMediaFragments('@source "@x";\n.keep{display:block}')).toBe('@source "@x";\n.keep{display:block}')
    expect(stripTailwindSourceMediaFragments('@media source(none) {\n.hidden{display:none}')).toBe('.hidden{display:none}')
    expect(stripTailwindSourceMediaFragments('} /* source(none) */\n.keep{display:block}')).toBe('.keep{display:block}')
    expect(stripUnmatchedTailwindSourceMediaCloseFragments('}\n.keep{display:block}')).toBe('.keep{display:block')
    expect(stripUnmatchedTailwindSourceMediaCloseFragments('}\n.keep{display:block}\n}')).toBe('.keep{display:block}')
    expect(stripUnmatchedTailwindSourceMediaCloseFragments('.keep{display:block')).toBe('.keep{display:block')
    expect(stripUnmatchedTailwindSourceMediaCloseFragments('.keep{display:block}')).toBe('.keep{display:block}')
  })

  it('splits and detects user layer blocks', () => {
    const split = splitUserCssLayerBlocks('@layer components{.card{display:flex}}.plain{color:red}')

    expect(hasUserCssLayerBlocks(split.layer)).toBe(true)
    expect(split.layer).toContain('@layer components')
    expect(split.rest).toContain('.plain')
    expect(hasUserCssLayerBlocks('.plain{color:red}')).toBe(false)
    expect(hasUserCssLayerBlocks('@layer {')).toBe(true)
    expect(splitUserCssLayerBlocks('@layer {').layer).toBe('@layer {')
    expect(splitUserCssLayerBlocks('.plain{color:red}')).toEqual({
      layer: '',
      rest: '.plain{color:red}',
    })
  })

  it('extracts generated css matching user layer selectors', () => {
    const result = extractGeneratedCssForUserLayerSelectors(
      '.card{display:flex}.card:hover{color:red}.plain{color:blue}',
      '@layer components{.card{display:flex}}',
    )

    expect(result.layer).toContain('.card')
    expect(result.layer).toContain('.card:hover')
    expect(result.rest).toContain('.plain')
    expect(extractGeneratedCssForUserLayerSelectors('.broken{', '@layer components{.card{display:flex}}')).toEqual({
      layer: '',
      rest: '.broken{',
    })
    expect(extractGeneratedCssForUserLayerSelectors('.card{display:flex}', '@layer {')).toEqual({
      layer: '',
      rest: '.card{display:flex}',
    })
    expect(extractGeneratedCssForUserLayerSelectors('.plain{display:block}', '.card{display:flex}')).toEqual({
      layer: '',
      rest: '.plain{display:block}',
    })
  })

  it('filters apply-only generated css while keeping variable rules', () => {
    const source = '.card{@apply flex}.other{color:red}'
    const filtered = filterApplyOnlyGeneratedCss(
      '.card{display:flex}.card:hover{color:red}.other{color:red}:root{--x:1}',
      source,
    )

    expect(filtered).toContain('.card')
    expect(filtered).toContain('--x')
    expect(filtered).not.toContain('.other')
    const scopedFiltered = filterApplyOnlyGeneratedCss(
      ':root{--spacing:0.25rem}html{line-height:1.5}.flex{display:flex}.hello-world-shell[data-v-abc]{display:flex}',
      '.hello-world-shell { @apply flex; }',
    )
    expect(scopedFiltered).toContain('.hello-world-shell[data-v-abc]')
    expect(scopedFiltered).toContain('--spacing')
    expect(scopedFiltered).not.toContain('html{line-height')
    expect(scopedFiltered).not.toContain('.flex{display:flex}')
    const duplicateScopedFiltered = filterApplyOnlyGeneratedCss([
      '.hello-world-shell{display:flex;gap:calc(var(--spacing, 0.25rem) * 2)}',
      '.hello-world-shell.data-v-abc{display:flex;gap:calc(var(--spacing, .25rem) * 2)}',
      '@media (min-width: 640px){.hello-world-shell{gap:1rem}.hello-world-shell[data-v-abc]{gap:1rem}}',
      '@supports (display:grid){.hello-world-shell{display:grid}}',
    ].join(''), '.hello-world-shell{@apply flex}', {
      preferScopedRules: true,
    })
    expect(duplicateScopedFiltered).not.toContain('.hello-world-shell{display:flex;gap:calc(var(--spacing, 0.25rem) * 2)}')
    expect(duplicateScopedFiltered).not.toContain('@media (min-width: 640px){.hello-world-shell{gap:1rem}')
    expect(duplicateScopedFiltered).toContain('.hello-world-shell.data-v-abc{display:flex;gap:calc(var(--spacing, .25rem) * 2)}')
    expect(duplicateScopedFiltered).toContain('.hello-world-shell[data-v-abc]{gap:1rem}')
    expect(duplicateScopedFiltered).toContain('@supports (display:grid){.hello-world-shell{display:grid}}')
    expect(filterApplyOnlyGeneratedCss(
      '.hello-world-shell{display:flex}.hello-world-shell.data-v-abc{display:flex}',
      '.hello-world-shell{@apply flex}',
    )).toContain('.hello-world-shell{display:flex}')
    expect(filterApplyOnlyGeneratedCss('.broken{', '.card{@apply flex}')).toBe('.broken{')
    expect(filterApplyOnlyGeneratedCss('.card{display:flex}', '.card{color:red}')).toBe('.card{display:flex}')
    expect(filterApplyOnlyGeneratedCss(':root{--x:1}.card{display:flex}', '.card{@apply flex}', {
      preserveVariables: false,
    })).toBe('.card{display:flex}')
    expect(shouldFilterApplyOnlyGeneratedCss(4, 'weapp', '.card{@apply flex}', {
      hasGeneratedCss: false,
      hasGeneratedMarkers: false,
    })).toBe(true)
    expect(shouldFilterApplyOnlyGeneratedCss(4, 'web', '.card{@apply flex}', {
      hasGeneratedCss: false,
      hasGeneratedMarkers: false,
    })).toBe(true)
    expect(shouldFilterApplyOnlyGeneratedCss(4, 'weapp', '@reference "tailwindcss";\n.card{@apply flex}', {
      hasGeneratedCss: false,
      hasGeneratedMarkers: false,
    })).toBe(true)
    expect(filterApplyOnlyGeneratedCss(
      '.flex{display:flex}.card{display:flex}',
      '@reference "tailwindcss";\n.card{@apply flex}',
    )).toBe('.card{display:flex}')
    expect(shouldFilterApplyOnlyGeneratedCss(4, 'weapp', '@tailwind utilities;\n.card{@apply flex}', {
      hasGeneratedCss: false,
      hasGeneratedMarkers: false,
    })).toBe(false)
    expect(shouldFilterApplyOnlyGeneratedCss(4, 'weapp', '.card{@apply flex}.other{color:red}', {
      hasGeneratedCss: false,
      hasGeneratedMarkers: false,
    })).toBe(false)
    expect(shouldFilterApplyOnlyGeneratedCss(4, 'weapp', '.card{@apply flex}', {
      hasGeneratedCss: true,
      hasGeneratedMarkers: false,
    })).toBe(false)
  })

  it('removes hover selectors and generated artifacts from mini-program css', async () => {
    expect(removeMiniProgramHoverSelectors('.btn:hover{color:red}.btn{color:blue}')).toContain('.btn{color:blue}')
    expect(removeMiniProgramHoverSelectors('@media screen{.btn:hover{color:red}}.btn{color:blue}')).toBe('.btn{color:blue}')
    expect(removeMiniProgramHoverSelectors('.btn:hover{color:red}', false)).toContain(':hover')
    expect(removeMiniProgramHoverSelectors('.broken:hover{')).toBe('.broken:hover{')
    expect(removeMiniProgramInteractiveSelectors([
      '.active\\:bg-red:active{color:red}',
      '.group:not(*:active) .child{color:red}',
      '.literal\\:active{color:blue}',
      '[data-state=":active"]{color:purple}',
      '.keep{color:green}',
    ].join(''), { active: true })).toBe('.literal\\:active{color:blue}[data-state=":active"]{color:purple}.keep{color:green}')
    expect(removeMiniProgramInteractiveSelectors('.btn:active{color:red}', { active: false })).toContain(':active')
    expect(isCommentOnlyCss('/* only comment */')).toBe(true)
    expect(isCommentOnlyCss('.broken{')).toBe(false)
    expect(removeTailwindV4GeneratedUserCssArtifacts('/* Deprecated */\n.keep{color:red}')).toBe('.keep{color:red}')
    expect(removeTailwindV4GeneratedUserCssArtifacts([
      ':host,page,.tw-root,wx-root-portal-content{--color-red-500:red}',
      '[hidden]:not([hidden="until-found"]){display:none}',
      'abbr[title]{text-decoration:underline}',
      'button,input[type="button"],input[type="reset"],input[type="submit"]{appearance:button}',
      '.keep{color:red}',
    ].join('\n'), ':root,:host{--color-red-500:red}')).toBe('.keep{color:red}')
    expect(removeTailwindV4GeneratedUserCssArtifacts([
      'page{',
      '--test-color:#006241;',
      '--color-test:#006241;',
      '--font-test:sans-serif;',
      '}',
    ].join(''))).toContain('--color-test:#006241')
    expect(removeTailwindV4GeneratedUserCssArtifacts(':host,page{--color-test:#006241}')).toContain('--color-test:#006241')
    const mixedTheme = removeTailwindV4GeneratedUserCssArtifacts(
      ':host,:root{--color-red-500:red;--spacing:.25rem;--test-color:#006241;--brand-color:#123456}',
    )
    expect(mixedTheme).toContain('--test-color:#006241')
    expect(mixedTheme).toContain('--brand-color:#123456')
    expect(removeTailwindV4GeneratedUserCssArtifacts(
      ' :host, page, .tw-root, wx-root-portal-content { --color-red-500: red; --spacing: .25rem; } ',
      ':host,page,.tw-root,wx-root-portal-content{--color-red-500:red;--spacing:.25rem}',
    ).trim()).toBe('')
    expect(removeTailwindV4GeneratedUserCssArtifacts('.broken{')).toBe('.broken{')

    const styleHandler = vi.fn(async (css: string) => ({ css: `${css}.handled{color:green}` }))
    const transformed = await transformGeneratorUserCss('.btn:hover{color:red}.btn{color:blue}', {
      generatorTarget: 'weapp',
      generatorStyleOptions: { cssRemoveHoverPseudoClass: true },
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
    })

    expect(transformed).toContain('.btn')
    expect(transformed).toContain('.handled')
    expect(styleHandler).toHaveBeenCalledWith(expect.stringContaining(':hover'), expect.objectContaining({
      cssRemoveHoverPseudoClass: true,
    }))

    const droppingBareSelectorStyleHandler = vi.fn(async () => ({
      css: '.card{color:red}',
    }))
    await expect(transformGeneratorUserCss([
      '@layer base{wx-button{background:#000}}',
      'abc{background:#222}',
      '.card{color:red}',
    ].join('\n'), {
      generatorTarget: 'weapp',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler: droppingBareSelectorStyleHandler,
      importFallback: true,
    })).resolves.toContain('wx-button{background:#000}')
    await expect(transformGeneratorUserCss([
      '@layer base{wx-button{background:#000}}',
      'abc{background:#222}',
      '.card{color:red}',
    ].join('\n'), {
      generatorTarget: 'weapp',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler: droppingBareSelectorStyleHandler,
      importFallback: true,
    })).resolves.toContain('abc{background:#222}')
    await expect(transformGeneratorUserCss([
      '@import "./dep.css";',
      '@media screen { .card{color:red} }',
      'wx-button{background:#000}',
    ].join('\n'), {
      generatorTarget: 'weapp',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler: droppingBareSelectorStyleHandler,
      importFallback: true,
    })).resolves.toContain('wx-button{background:#000}')
    await expect(transformGeneratorUserCss('@layer base { .broken{', {
      generatorTarget: 'weapp',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler: vi.fn(async (css: string) => ({ css })),
      importFallback: true,
    })).resolves.toContain('@layer base')

    await expect(transformGeneratorUserCss('.btn:hover{color:red}.btn{color:blue}', {
      generatorTarget: 'weapp',
      generatorStyleOptions: { cssRemoveHoverPseudoClass: true },
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
      processed: true,
    })).resolves.not.toContain(':hover')

    const processedLayerCss = await transformGeneratorUserCss([
      '@layer base {',
      '  button::after, wx-button::after { display:none; border:none; content:""; }',
      '  wx-button { background:#000; }',
      '}',
      'abc{background:#222}',
    ].join('\n'), {
      generatorTarget: 'weapp',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
      processed: true,
    })
    expect(processedLayerCss).not.toContain('@layer')
    expect(processedLayerCss).toContain('button::after, wx-button::after')
    expect(processedLayerCss).toContain('wx-button { background:#000; }')
    expect(processedLayerCss).toContain('abc{background:#222}')

    await expect(transformGeneratorUserCss('@media source("./src") { .hidden{color:red} }\n.web{color:blue}', {
      generatorTarget: 'web',
      generatorStyleOptions: { cssRemoveHoverPseudoClass: true },
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
      processed: true,
    })).resolves.toContain('.web')

    await expect(transformGeneratorUserCss('   ', {
      generatorTarget: 'weapp',
      generatorStyleOptions: {},
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
    })).resolves.toBe('')
  })

  it('precomputes configured cssCalc variables for web user css', async () => {
    const styleHandler = vi.fn(async (css: string) => ({ css: `handled:${css}` }))
    const css = await transformGeneratorUserCss('.raw-btn{gap:calc(var(--spacing) * 2)}', {
      generatorTarget: 'web',
      generatorStyleOptions: {
        cssCalc: ['--spacing'],
      },
      cssUserHandlerOptions: {} as any,
      styleHandler,
      importFallback: true,
      generatedSource: ':root{--spacing:.25rem}',
    })

    expect(styleHandler).not.toHaveBeenCalled()
    expect(css).toMatch(/gap:\s*0\.5rem/)
    expect(css).not.toMatch(/gap:\s*calc\(var\(--spacing\)/)
  })
})
