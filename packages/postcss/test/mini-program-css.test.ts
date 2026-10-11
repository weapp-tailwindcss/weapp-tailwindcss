import { describe, expect, it } from 'vitest'
import {
  finalizeMiniProgramCss,
  finalizeMiniProgramCssRoot,
  hasMiniProgramCssSpecificityPlaceholders,
  hoistTailwindPreflightBase,
  normalizeMiniProgramPrefixedDeclaration,
  pruneMiniProgramGeneratedCss,
  removeUnsupportedCascadeLayers,
  removeUnsupportedMiniProgramPrefixedAtRule,
  removeUnsupportedMiniProgramAtRules,
  stripMiniProgramCssSpecificityPlaceholders,
  unwrapUnsupportedCascadeLayers,
} from '../src'
import postcss, { AtRule, Declaration } from 'postcss'
import {
  hasTailwindcssV4Signal,
  removeTailwindGenerationDirectives,
  unwrapTailwindSourceMedia,
} from '../src/compat/mini-program-css/directives'
import { createHoistInsertionAnchor, insertHoistedRules, mergeEquivalentHoistedRules } from '../src/compat/mini-program-css/hoist'
import { collectPreflightRules, createPreflightResetRule } from '../src/compat/mini-program-css/preflight'
import {
  hasTailwindPreflightDeclaration,
  hasTwContentDeclaration,
  isBrowserElementPreflightRule,
  isCustomPropertyRule,
  isEmptyTwContentDeclaration,
  isMiniProgramPreflightRule,
  isMiniProgramThemeVariableRule,
  isPseudoContentInitRule,
  usesTwContentVariable,
} from '../src/compat/mini-program-css/predicates'
import {
  removeDisplayP3Declarations,
  removeEmptyAtRules,
  removeRootSpecificityPlaceholders,
  removeSpecificityPlaceholders,
  removeTailwindContainerMaxWidthMediaRules,
  removeTailwindContainerWidthRules,
  removeUnsupportedBrowserSelectors,
  removeUnsupportedModernColorDeclarations,
} from '../src/compat/mini-program-css/root-cleanups'

describe('mini-program css cleanup', () => {
  it('finalizes an existing PostCSS root in place', () => {
    const source = '@plugin "example";\n@source "./src";\n@supports (display: grid) { .grid { display: grid; } }\n.card { display: flex; }'
    const root = postcss.parse(source)
    finalizeMiniProgramCssRoot(root)
    expect(root.toString()).toBe(finalizeMiniProgramCss(source))
    expect(root.toString()).toBe('.card { display: flex; }')
  })

  it('covers mini-program predicate helper branches', () => {
    const root = postcss.parse([
      'button{appearance:button}',
      'textarea{resize:vertical}',
      'button{appearance:none}',
      'button,input{appearance:button}',
      'view,text,::before,::after{box-sizing:border-box}',
      '*{--tw-shadow:0 0 #0000}',
      'view,text{color:red}',
      '::before,::after{--tw-content:""}',
      '::before{--tw-content:"";color:red}',
      ':host,page,.tw-root,wx-root-portal-content{--color-red:red}',
      ':host,page,.tw-root,wx-root-portal-content{--color-red:red;color:red}',
      '.content{content:var(--tw-content)}',
    ].join('\n'))
    const rules = root.nodes!.filter((node): node is postcss.Rule => node.type === 'rule')

    expect(isBrowserElementPreflightRule(rules[0])).toBe(true)
    expect(isBrowserElementPreflightRule(rules[1])).toBe(true)
    expect(isBrowserElementPreflightRule(rules[2])).toBe(false)
    expect(isBrowserElementPreflightRule(rules[3])).toBe(false)
    expect(hasTailwindPreflightDeclaration(rules[4])).toBe(true)
    expect(isMiniProgramPreflightRule(rules[4])).toBe(true)
    expect(isMiniProgramPreflightRule(rules[5])).toBe(true)
    expect(isMiniProgramPreflightRule(rules[6])).toBe(false)
    expect(isPseudoContentInitRule(rules[7])).toBe(true)
    expect(isPseudoContentInitRule(rules[8])).toBe(false)
    expect(hasTwContentDeclaration(rules[7])).toBe(true)
    expect(isEmptyTwContentDeclaration(rules[7].first as Declaration)).toBe(true)
    expect(isCustomPropertyRule(rules[9])).toBe(true)
    expect(isMiniProgramThemeVariableRule(rules[9])).toBe(true)
    expect(isCustomPropertyRule(rules[10])).toBe(false)
    expect(isMiniProgramThemeVariableRule(rules[10])).toBe(false)
    expect(usesTwContentVariable(root)).toBe(true)
  })

  it('unwraps unsupported cascade layer blocks', () => {
    const root = postcss.parse([
      '@layer utilities {',
      '.text-red-500{color:red}',
      '}',
    ].join('\n'))

    removeUnsupportedCascadeLayers(root)

    expect(root.toString()).not.toContain('@layer')
    expect(root.toString()).toContain('.text-red-500{color:red}')
  })

  it('orders cascade layer blocks before removing their wrappers', () => {
    const root = postcss.parse([
      '@layer reset, components, utilities;',
      '@layer utilities{.utility{color:blue}}',
      '@layer reset{.reset{color:red}}',
      '@layer components{.component{color:green}}',
      '@layer utilities{.utility-later{color:purple}}',
      '.unlayered{color:black}',
    ].join('\n'))

    removeUnsupportedCascadeLayers(root)

    const css = root.toString()
    expect(css).not.toContain('@layer')
    expect(css.indexOf('.reset')).toBeLessThan(css.indexOf('.component'))
    expect(css.indexOf('.component')).toBeLessThan(css.indexOf('.utility'))
    expect(css.indexOf('.utility')).toBeLessThan(css.indexOf('.utility-later'))
    expect(css.indexOf('.utility-later')).toBeLessThan(css.indexOf('.unlayered'))
  })

  it('preserves generated css before the first layer anchor', () => {
    const root = postcss.parse([
      ':root{--color-brand:red}',
      '@layer theme, base, utilities;',
      '@layer base{view{box-sizing:border-box}}',
      '@layer utilities{.block{display:block}}',
    ].join('\n'))

    removeUnsupportedCascadeLayers(root)

    const css = root.toString()
    expect(css.indexOf(':root')).toBeLessThan(css.indexOf('view'))
    expect(css.indexOf('view')).toBeLessThan(css.indexOf('.block'))
  })

  it('preserves conditional wrappers and orders nested and anonymous layers', () => {
    const root = postcss.parse([
      '@layer shell, next;',
      '@layer shell {',
      '  .shell-direct{display:block}',
      '  @layer first, second;',
      '  @layer second{.shell-second{display:grid}}',
      '  @media (min-width: 640px){@layer first{.shell-first{display:flex}}}',
      '}',
      '@layer {.anonymous{color:red}}',
      '@layer next{.next{color:blue}}',
    ].join('\n'))

    removeUnsupportedCascadeLayers(root)

    const css = root.toString()
    expect(css).not.toContain('@layer')
    expect(css).toContain('@media (min-width: 640px){.shell-first{display:flex}}')
    expect(css.indexOf('.shell-first')).toBeLessThan(css.indexOf('.shell-second'))
    expect(css.indexOf('.shell-second')).toBeLessThan(css.indexOf('.shell-direct'))
    expect(css.indexOf('.shell-direct')).toBeLessThan(css.indexOf('.next'))
    expect(css).toContain('.anonymous{color:red}')
  })

  it('unwraps unsupported cascade layer blocks from css strings', () => {
    const css = unwrapUnsupportedCascadeLayers([
      '@layer base {',
      '  .wx-only{color:red}',
      '}',
    ].join('\n'))

    expect(css).not.toContain('@layer base')
    expect(css).toContain('.wx-only{color:red}')
  })

  it('removes unsupported at-rules with a parser fallback', () => {
    const css = removeUnsupportedMiniProgramAtRules([
      '@supports (display:grid){.grid{display:grid}}',
      '@property --x { syntax: "<number>"; inherits: false; initial-value: 0; }',
      '.block{display:block}',
    ].join('\n'))

    expect(css).not.toContain('@supports')
    expect(css).not.toContain('@property')
    expect(css).toContain('.block{display:block}')
  })

  it('removes unsupported at-rules by scanning malformed css', () => {
    const css = removeUnsupportedMiniProgramAtRules([
      '@supports (display:grid){.grid{display:grid}.nested{color:red}}',
      '.block{display:block}',
      '@property --x',
    ].join('\n'))

    expect(css).not.toContain('@supports')
    expect(css).toContain('.block{display:block}')
    expect(css).not.toContain('@property')
  })

  it('scanner fallback preserves css around unsupported blocks when parsing fails', () => {
    const css = removeUnsupportedMiniProgramAtRules([
      '.before{color:green}',
      '@supports (display:grid){.grid{display:grid}.nested{color:red}}',
      '.after{color:',
    ].join('\n'))

    expect(css).toContain('.before{color:green}')
    expect(css).toContain('.after{color:')
    expect(css).not.toContain('@supports')
    expect(css).not.toContain('.grid')
  })

  it('scanner fallback keeps malformed unsupported at-rules without blocks', () => {
    const css = removeUnsupportedMiniProgramAtRules([
      '.before{color:green}',
      '@supports display-grid',
      '.after{color:',
    ].join('\n'))

    expect(css).toBe('.before{color:green}\n')
  })

  it('removes empty cascade layer blocks', () => {
    const root = postcss.parse('@layer utilities;@layer components{} .card{display:flex}')

    removeUnsupportedCascadeLayers(root)

    expect(root.toString()).toBe('.card{display:flex}')
  })

  it('detects Tailwind v4 signals and cleans generation directives', () => {
    expect(hasTailwindcssV4Signal('/*! tailwindcss v4.1.10 */')).toBe(true)
    expect(hasTailwindcssV4Signal('@property --tw-rotate-x{syntax:"*"}')).toBe(true)
    expect(hasTailwindcssV4Signal('.card{display:flex}')).toBe(false)

    const root = postcss.parse([
      '@media source("./src") {.card{display:flex}}',
      '@media source(none) {}',
      '/*! weapp-tailwindcss generator-placeholder */',
      '@config "./tailwind.config.ts";',
      '@plugin "@iconify/tailwind4";',
      '@reference "tailwindcss";',
      '@tailwind utilities;',
      '@source "./src";',
      '.keep{color:red}',
    ].join('\n'))
    unwrapTailwindSourceMedia(root)
    removeTailwindGenerationDirectives(root)

    expect(root.toString()).toContain('.card{display:flex}')
    expect(root.toString()).toContain('.keep{color:red}')
    expect(root.toString()).not.toContain('source(')
    expect(root.toString()).not.toContain('@config')
    expect(root.toString()).not.toContain('@plugin')
    expect(root.toString()).not.toContain('@reference')
    expect(root.toString()).not.toContain('@tailwind')
    expect(root.toString()).not.toContain('generator-placeholder')
  })

  it('exposes specificity placeholder string helpers', () => {
    const source = 'page:not(#n),.btn:not(#\\#){color:red}'

    expect(hasMiniProgramCssSpecificityPlaceholders(source)).toBe(true)
    expect(stripMiniProgramCssSpecificityPlaceholders(source)).toBe('page,.btn{color:red}')
    expect(hasMiniProgramCssSpecificityPlaceholders('.btn{color:red}')).toBe(false)
  })

  it('tolerates rules without selector arrays in root cleanup helpers', () => {
    const fakeRoot = {
      walkRules(callback: (rule: postcss.Rule) => void) {
        callback({ selectors: undefined } as unknown as postcss.Rule)
        callback({ selectors: [] } as unknown as postcss.Rule)
      },
    } as unknown as postcss.Root

    expect(() => removeSpecificityPlaceholders(fakeRoot)).not.toThrow()
    expect(() => removeRootSpecificityPlaceholders(fakeRoot)).not.toThrow()
    expect(() => removeUnsupportedBrowserSelectors(fakeRoot)).not.toThrow()
  })

  it('keeps cleanup no-ops for empty selector arrays and unsupported container shapes', () => {
    const emptySelectorsRoot = postcss.parse('.card{color:red}')
    const rule = emptySelectorsRoot.first as postcss.Rule
    rule.selectors = []
    removeSpecificityPlaceholders(emptySelectorsRoot)
    removeRootSpecificityPlaceholders(emptySelectorsRoot)
    removeUnsupportedBrowserSelectors(emptySelectorsRoot)
    expect(rule.selectors).toEqual([''])

    const containerRoot = postcss.parse([
      '.container{width:100%;/* generated */}',
      '@media (orientation: landscape){.container{max-width:640px}}',
      '@media (min-width:640px){.container{max-width:640px;color:red}}',
    ].join('\n'))
    removeTailwindContainerWidthRules(containerRoot)
    removeTailwindContainerMaxWidthMediaRules(containerRoot)
    const css = containerRoot.toString()
    expect(css).toContain('orientation: landscape')
    expect(css).toContain('max-width:640px;color:red')
    expect(css).not.toContain('.container{width:100%')
  })

  it('finalizes generated css for mini-program runtime constraints', () => {
    const css = finalizeMiniProgramCss([
      '@layer utilities {',
      '.bg-blue-500:not(#\\#){color:oklch(62.3% 0.214 259.815)}',
      '.icon-\\[mdi--home\\]:not(#n){display:inline-block}',
      '}',
      ':host,page,.tw-root,wx-root-portal-content{--tw-content:"";--color-p3:color(display-p3 0.26642 0.49122 0.98862)}',
      '::-webkit-calendar-picker-indicator{display:none}',
    ].join('\n'))

    expect(css).not.toContain('@layer')
    expect(css).not.toContain(':not(#\\#)')
    expect(css).not.toContain(':not(#n)')
    expect(css).not.toContain('--tw-content')
    expect(css).not.toContain('display-p3')
    expect(css).not.toContain('::-webkit-calendar-picker-indicator')
    expect(css).toContain('.bg-blue-500{color:rgb(50, 128, 255)}')
    expect(css).toContain('.icon-\\[mdi--home\\]{display:inline-block}')
    expect(css).toContain('--color-p3:rgb(50, 128, 255)')
  })

  it('removes cascade layer specificity placeholders when pruning generated css', () => {
    const css = pruneMiniProgramGeneratedCss([
      '@layer utilities {',
      '.navbar__items:not(#\\#):not(#\\#){gap:.75rem}',
      '.icon-\\[mdi--home\\]:not(#n){display:inline-block}',
      '}',
    ].join('\n'))

    expect(css).not.toContain('@layer')
    expect(css).not.toContain(':not(#\\#)')
    expect(css).not.toContain(':not(#n)')
    expect(css).toContain('.navbar__items{gap:.75rem}')
    expect(css).toContain('.icon-\\[mdi--home\\]{display:inline-block}')
  })

  it('preserves selected generated css while pruning browser-only branches', () => {
    const css = pruneMiniProgramGeneratedCss([
      '/* #ifdef MP-WEIXIN */',
      '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}',
      '::before,::after{--tw-content:""}',
      'view,text,::before,::after{--tw-content:""}',
      'view,text{--tw-gradient-from:red;--tw-gradient-to:blue}',
      ':host,page,.tw-root,wx-root-portal-content{--tw-gradient-from:red;--tw-gradient-to:blue}',
      'view{display:block}',
      'button{appearance:button}',
      '.card{color:red}',
      'html{line-height:1.5}',
    ].join('\n'), {
      preservePreflight: true,
      preserveConditionalComments: true,
    })

    expect(css).toContain('#ifdef MP-WEIXIN')
    expect(css).toContain('@keyframes spin')
    expect(css).toContain('::before,::after{--tw-content:""}')
    expect(css).toContain('::before,\n::after')
    expect(css).toContain('view,text,::after,::before{--tw-gradient-from:red;--tw-gradient-to:blue}')
    expect(css).toContain('view{display:block}')
    expect(css).toContain('.card{color:red}')
    expect(css).not.toContain('appearance:button')
    expect(css).not.toContain('html{line-height')
  })

  it('removes specificity placeholders even when final css parsing fails', () => {
    const css = finalizeMiniProgramCss([
      '.bg-red-500:not(#\\#):not(#n){color:red',
      '.text-red-500:not(#\\#){color:red}',
    ].join('\n'))

    expect(css).not.toContain(':not(#\\#)')
    expect(css).not.toContain(':not(#n)')
  })

  it('removes root specificity placeholders from finalized css without touching user selectors', () => {
    const css = finalizeMiniProgramCss([
      'page:not(.does-not-exist),.tw-root,wx-root-portal-content:not(.does-not-exist){--nut-icon-height:32rpx}',
      '.btn:not(.does-not-exist){color:red}',
    ].join('\n'))

    expect(css).toContain('page,.tw-root,wx-root-portal-content{--nut-icon-height:32rpx}')
    expect(css).toContain('.btn:not(.does-not-exist){color:red}')
    expect(css).not.toContain('page:not(.does-not-exist)')
    expect(css).not.toContain('wx-root-portal-content:not(.does-not-exist)')
  })

  it('normalizes Tailwind v4 rounded-full infinity radius for mini-program output', () => {
    const css = finalizeMiniProgramCss([
      '/*! tailwindcss v4.2.4 */',
      '.rounded-full{border-radius:calc(infinity * 1px)}',
      '.rounded-t-full{border-top-left-radius:calc(infinity * 1px);border-top-right-radius:calc(infinity * 1px)}',
    ].join('\n'))

    expect(css).toContain('.rounded-full{border-radius:9999px}')
    expect(css).toContain('border-top-left-radius:9999px')
    expect(css).toContain('border-top-right-radius:9999px')
    expect(css).not.toContain('infinity')
  })

  it('hoists, merges, and inserts mini-program base rules around imports', () => {
    const root = postcss.parse([
      '@charset "UTF-8";',
      '@import "./base.css";',
      '.card{display:flex}',
      'view,text,::before,::after{--tw-space-y-reverse:0}',
    ].join('\n'))
    const anchor = createHoistInsertionAnchor(root)
    const preflight = postcss.rule({
      selector: 'view,text,::after,::before',
      nodes: [
        new Declaration({ prop: '--tw-space-y-reverse', value: '1' }),
        new Declaration({ prop: 'box-sizing', value: 'border-box' }),
      ],
    })
    const extra = postcss.rule({
      selector: '::before,text,view,::after',
      nodes: [
        new Declaration({ prop: 'margin', value: '0' }),
        new Declaration({ prop: '--tw-space-y-reverse', value: '2' }),
      ],
    })
    const merged = mergeEquivalentHoistedRules([preflight, extra])

    insertHoistedRules(root, merged, anchor)
    expect(root.toString()).toContain('@import "./base.css";')
    expect(root.toString()).toContain('view,text,::after,::before{box-sizing:border-box;margin:0;--tw-space-y-reverse:1;}')
    expect(root.toString().match(/--tw-space-y-reverse/g)).toHaveLength(2)

    const emptyRoot = postcss.parse('.card{display:flex}')
    const detachedAnchor = postcss.comment({ text: 'detached' })
    insertHoistedRules(emptyRoot, [], detachedAnchor)
    expect(emptyRoot.toString()).toBe('.card{display:flex}')
  })

  it('handles hoist anchors without raw spacing and reset-only merge order', () => {
    const root = postcss.parse('view,text,::before,::after{box-sizing:border-box}')
    const anchor = createHoistInsertionAnchor(root)
    expect(anchor).toBeDefined()
    delete anchor!.raws.before

    const first = postcss.rule({
      selector: 'text,view,::before,::after',
      nodes: [
        new Declaration({ prop: 'color', value: 'red' }),
        new Declaration({ prop: 'border-width', value: '0' }),
      ],
    })
    const second = postcss.rule({
      selector: '::after,::before,view,text',
      nodes: [
        new Declaration({ prop: 'margin', value: '0' }),
      ],
    })
    const merged = mergeEquivalentHoistedRules([first, second])
    insertHoistedRules(root, merged, anchor)

    const css = root.toString().replace(/\s+/g, '')
    expect(css).toContain('border-width:0;margin:0;color:red')
  })

  it('hoists Tailwind preflight base and falls back on invalid css', () => {
    expect(hoistTailwindPreflightBase([
      '.card{display:flex}',
      'view,text,::before,::after{box-sizing:border-box}',
    ].join('\n'))).toContain('view,text,::after,::before{box-sizing:border-box}')
    expect(hoistTailwindPreflightBase('.broken{color:red')).toBe('.broken{color:red')
  })

  it('collects preflight rules and applies configured declaration overrides', () => {
    const root = postcss.parse([
      '::before,::after{--tw-content:""}',
      'view,text,::before,::after{box-sizing:border-box;border-width:1px}',
    ].join('\n'))
    const rules = collectPreflightRules(root, {
      cssPreflight: {
        'border-width': false,
        margin: '0',
      },
    })

    expect(rules.map(rule => rule.toString())).toEqual([
      'view,text,::after,::before{margin:0;box-sizing:border-box}',
    ])
    expect(root.toString()).toBe('')
  })

  it('handles empty preflight, anchor, and reset-rule edge cases', () => {
    const root = postcss.parse('.card{display:flex}')
    expect(createHoistInsertionAnchor(root)).toBeUndefined()
    expect(collectPreflightRules(root)).toEqual([])
    expect(createPreflightResetRule(undefined)).toBeUndefined()
    expect(createPreflightResetRule(false as any)).toBeUndefined()
    expect(createPreflightResetRule({ margin: false })).toBeUndefined()
    expect(createPreflightResetRule({ margin: 0 })?.toString().replace(/\s+/g, '')).toBe('view,text,::after,::before{margin:0}')

    const importRoot = postcss.parse('@charset "UTF-8";\n@import "./base.css";\n.card{display:flex}')
    const rule = postcss.rule({
      selector: 'view,text,::after,::before',
      nodes: [new Declaration({ prop: 'box-sizing', value: 'border-box' })],
    })
    insertHoistedRules(importRoot, [rule])
    expect(importRoot.toString()).toContain('@import "./base.css";\nview,text,::after,::before{box-sizing:border-box}')
  })

  it('deduplicates hoisted rule declarations without dropping comments', () => {
    const first = postcss.rule({
      selector: 'text,view,::before,::after',
      nodes: [
        postcss.comment({ text: 'preflight' }),
        new Declaration({ prop: 'color', value: 'red' }),
      ],
    })
    const second = postcss.rule({
      selector: '::after,::before,view,text',
      nodes: [
        new Declaration({ prop: 'color', value: 'blue' }),
        postcss.comment({ text: 'kept' }),
        new Declaration({ prop: 'margin', value: '0' }),
      ],
    })

    const merged = mergeEquivalentHoistedRules([first, second])
    expect(merged).toHaveLength(1)
    expect(merged[0].toString()).toContain('/* kept */')
    expect(merged[0].toString().replace(/\s+/g, '')).toContain('margin:0')
    expect(merged[0].toString()).not.toContain('color:blue')
  })

  it('cleans browser-only selectors, display-p3 media, container rules, and unsupported modern colors', () => {
    const root = postcss.parse([
      '@media (color-gamut: p3){.p3{color:red}}',
      '@media (min-width: 640px){.container{max-width:640px}}',
      '@media (min-width: 768px){.container{max-width:768px;color:red}}',
      '/* tokens: container <= <tailwind generated> */',
      '.container{width:100%}',
      '.container{width:100%;color:red}',
      'button{appearance:button}',
      'a,abbr:where([title]),audio{color:inherit}',
      '::-webkit-calendar-picker-indicator{display:none}',
      '.mixed,a{color:red}',
      ':host{--brand:oklch(62.3% 0.214 259.815)}',
      '.ok{color:color-mix(in oklab,var(--brand) 50%,transparent)}',
      '.bad{color:color-mix(in oklab,var(--missing) 50%,transparent)}',
    ].join('\n'))

    removeDisplayP3Declarations(root)
    removeTailwindContainerMaxWidthMediaRules(root)
    removeTailwindContainerWidthRules(root, { generatedOnly: true })
    removeUnsupportedBrowserSelectors(root)
    removeUnsupportedModernColorDeclarations(root)
    removeEmptyAtRules(root)

    const css = root.toString()
    expect(css).not.toContain('color-gamut')
    expect(css).not.toContain('max-width:640px')
    expect(css).toContain('max-width:768px')
    expect(css).not.toContain('/* tokens: container')
    expect(css).toContain('.container{width:100%;color:red}')
    expect(css).not.toContain('appearance:button')
    expect(css).not.toContain('color:inherit')
    expect(css).not.toContain('calendar-picker')
    expect(css).toContain('.mixed{color:red}')
    expect(css).toContain('--brand:rgb(')
    expect(css).toContain('.ok{color:rgba(')
    expect(css).toContain('.bad{color:var(--missing)}')
  })

  it('cleans nested browser-only rules and empty modern color declarations', () => {
    const root = postcss.parse([
      '@media (min-width:640px){a{color:inherit}}',
      '@media (min-width:768px){@supports (display:grid){::-webkit-calendar-picker-indicator{display:none}}}',
      '.only-modern{color:color(display-p3 1 0 0)}',
      '.container{width:100%}',
      '/* tokens: container <= <tailwind generated> */',
      '.container{width:100%}',
      '@media (min-width:1024px){.container{max-width:1024px;/* generated */}}',
    ].join('\n'))

    removeUnsupportedBrowserSelectors(root)
    removeUnsupportedModernColorDeclarations(root)
    removeTailwindContainerWidthRules(root)
    removeTailwindContainerMaxWidthMediaRules(root)
    removeEmptyAtRules(root)

    const css = root.toString()
    expect(css).not.toContain('color:inherit')
    expect(css).not.toContain('calendar-picker')
    expect(css).toContain('.only-modern{color:rgb(')
    expect(css).not.toContain('.container{width:100%}')
    expect(css).not.toContain('min-width:1024px')
  })

  it('preserves non-generated container width rules when requested and removes empty at-rules', () => {
    const root = postcss.parse([
      '@media (min-width:640px){.container{max-width:640px;color:red}}',
      '@supports (display:grid){/* empty */}',
      '.container{width:100%}',
    ].join('\n'))

    removeTailwindContainerMaxWidthMediaRules(root)
    removeTailwindContainerWidthRules(root, { generatedOnly: true })
    removeEmptyAtRules(root)

    const css = root.toString()
    expect(css).toContain('max-width:640px')
    expect(css).toContain('.container{width:100%}')
    expect(css).not.toContain('@supports')
  })

  it('normalizes mini-program prefixed declarations while preserving useful webkit syntax', () => {
    const preservedMask = new Declaration({ prop: '-webkit-mask-image', value: 'linear-gradient(red, blue)' })
    normalizeMiniProgramPrefixedDeclaration(preservedMask)
    expect(preservedMask.parent).toBeUndefined()
    expect(preservedMask.prop).toBe('-webkit-mask-image')

    const preservedValue = new Declaration({ prop: 'display', value: '-webkit-box' })
    normalizeMiniProgramPrefixedDeclaration(preservedValue)
    expect(preservedValue.value).toBe('-webkit-box')

    const transition = new Declaration({
      prop: 'transition-property',
      value: '-webkit-transform, opacity, color-mix(in oklab, red, blue), "-webkit-quoted"',
    })
    normalizeMiniProgramPrefixedDeclaration(transition)
    expect(transition.value).toBe('opacity, color-mix(in oklab, red, blue), "-webkit-quoted"')

    const onlyWebkitTransition = new Declaration({ prop: 'transition', value: '-webkit-transform' })
    const transitionRule = postcss.rule({ selector: '.a' })
    transitionRule.append(onlyWebkitTransition)
    normalizeMiniProgramPrefixedDeclaration(onlyWebkitTransition)
    expect(onlyWebkitTransition.parent).toBeUndefined()

    const unsupportedProp = new Declaration({ prop: '-webkit-user-select', value: 'none' })
    const propRule = postcss.rule({ selector: '.b' })
    propRule.append(unsupportedProp)
    normalizeMiniProgramPrefixedDeclaration(unsupportedProp)
    expect(unsupportedProp.parent).toBeUndefined()

    const unsupportedKeyword = new Declaration({ prop: 'appearance', value: '-webkit-button' })
    const keywordRule = postcss.rule({ selector: '.c' })
    keywordRule.append(unsupportedKeyword)
    normalizeMiniProgramPrefixedDeclaration(unsupportedKeyword)
    expect(unsupportedKeyword.parent).toBeUndefined()
  })

  it('removes unsupported webkit keyframes at-rules only', () => {
    const root = postcss.root()
    const webkitKeyframes = new AtRule({ name: '-webkit-keyframes', params: 'spin' })
    const keyframes = new AtRule({ name: 'keyframes', params: 'spin' })
    root.append(webkitKeyframes, keyframes)

    removeUnsupportedMiniProgramPrefixedAtRule(webkitKeyframes)
    removeUnsupportedMiniProgramPrefixedAtRule(keyframes)

    expect(root.nodes).toEqual([keyframes])
  })

  it('hoists configured preflight rules and removes browser-only base selectors', () => {
    const css = finalizeMiniProgramCss([
      'button{appearance:button}',
      'textarea{resize:vertical}',
      'a,abbr:where([title]),audio{color:inherit}',
      'view,text,::before,::after{box-sizing:border-box;border-width:0;--tw-content:""}',
      '.card{display:flex}',
    ].join('\n'), {
      cssPreflight: {
        'border-width': false,
        'border-style': 'solid',
      },
    })

    expect(css).toContain('view,text,::after,::before{border-style:solid;box-sizing:border-box}')
    expect(css).toContain('.card{display:flex}')
    expect(css).not.toContain('appearance:button')
    expect(css).not.toContain('resize:vertical')
    expect(css).not.toContain('color:inherit')
    expect(css).not.toContain('border-width')
    expect(css).not.toContain('--tw-content')
  })

  it('injects configured preflight when generated css has no preflight rule', () => {
    const css = finalizeMiniProgramCss('.card{display:flex}', {
      cssPreflight: {
        'box-sizing': 'border-box',
        margin: false,
      },
    })

    expect(css).toContain('view,text,::after,::before{box-sizing:border-box}')
    expect(css).toContain('.card{display:flex}')
    expect(css).not.toContain('margin')
  })

  it('keeps incremental at-rule ancestors when recursive cleanup is disabled', () => {
    const css = finalizeMiniProgramCss('@media screen{/* incremental placeholder */}', {
      cssPreflight: false,
      removeEmptyAtRuleAncestors: false,
    })

    expect(css).toBe('@media screen{/* incremental placeholder */}')
  })

  it('keeps empty selector placeholders when recursive cleanup is disabled', () => {
    const source = ':is(page,.tw-root,wx-root-portal-content){/* incremental placeholder */}'
    const css = finalizeMiniProgramCss(source, {
      cssPreflight: false,
      removeEmptyAtRuleAncestors: false,
    })

    expect(css).toBe(source)
  })

  it('recursively removes empty at-rule ancestors for complete css output', () => {
    const css = finalizeMiniProgramCss('@media screen{@supports (display:grid){}}', {
      cssPreflight: false,
    })

    expect(css).toBe('')
  })

  it('removes empty selectors and their empty ancestors from complete css output', () => {
    const css = finalizeMiniProgramCss([
      ':is(page,.tw-root,wx-root-portal-content){}',
      '@media screen{.removed{/* declarations removed */}}',
      '.keep{color:red}',
    ].join('\n'), {
      cssPreflight: false,
    })

    expect(css).toBe('.keep{color:red}')
  })

  it('preserves empty keyframe steps in complete css output', () => {
    const source = '@keyframes spin{0%{}to{transform:rotate(1turn)}}'

    expect(finalizeMiniProgramCss(source, { cssPreflight: false })).toBe(source)
  })

  it('prunes browser-only generated css while preserving useful mini-program selectors', () => {
    const css = pruneMiniProgramGeneratedCss([
      '/* #ifdef MP-WEIXIN */',
      '@supports (display:grid){.grid{display:grid}}',
      '@media (min-width:640px){.container{max-width:640px}}',
      '/* tokens: container <= <tailwind generated> */',
      '.container{width:100%}',
      'button{appearance:button}',
      'view{display:block}',
      'view,text{--tw-space-y-reverse:0}',
      '::before,::after{--tw-content:""}',
      ':host,page,.tw-root,wx-root-portal-content{--tw-gradient-position:to right;--color-brand:red}',
      '.card{display:flex}',
      '@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(1turn)}}',
      '/* #endif */',
    ].join('\n'), {
      preserveConditionalComments: true,
    })

    expect(css).toContain('/* #ifdef MP-WEIXIN */')
    expect(css).toContain('/* #endif */')
    expect(css).toContain('view{display:block}')
    expect(css).toContain('view,text,::after,::before{--tw-gradient-position:to right}')
    expect(css).not.toContain(':host,page,.tw-root,wx-root-portal-content{--tw-gradient-position:to right}')
    expect(css).toContain('page,.tw-root,wx-root-portal-content,:host{--color-brand:red}')
    expect(css).toContain('.card{display:flex}')
    expect(css).toContain('@keyframes spin')
    expect(css).not.toContain('@supports')
    expect(css).not.toContain('max-width:640px')
    expect(css).not.toContain('width:100%')
    expect(css).not.toContain('appearance:button')
    expect(css).not.toContain('--tw-content')
  })

  it('preserves preflight and content init rules when pruning asks for preflight preservation', () => {
    const css = pruneMiniProgramGeneratedCss([
      'view,text,::before,::after{box-sizing:border-box;--tw-content:""}',
      '::before,::after{--tw-content:""}',
      '.before\\:content-\\[x\\]::before{content:var(--tw-content)}',
    ].join('\n'), {
      preservePreflight: true,
    })

    expect(css).toContain('view,text,::before,::after{box-sizing:border-box;--tw-content:""}')
    expect(css).toContain('::before,::after{--tw-content:""}')
    expect(css).toContain('content:var(--tw-content)')
  })
})
