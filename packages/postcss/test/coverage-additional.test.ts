import type { Plugin, Rule } from 'postcss'
import postcss, { AtRule, Declaration } from 'postcss'
import { describe, expect, it } from 'vitest'
import {
  appendTailwindcssV4MiniProgramGradientRules,
  collectUsedTailwindcssV4Variables,
  createMissingCssVarsV4Nodes,
  createUsedCssVarsV4Nodes,
  isTailwindcssV4,
  isTailwindcssV4DisplayP3Declaration,
  isTailwindcssV4DisplayP3Media,
  isTailwindcssV4DisplayP3Supports,
  isTailwindcssV4LinearGradientSupports,
  isTailwindcssV4ModernCheck,
  mergeTailwindcssV4GradientDirectionRules,
  normalizeTailwindcssV4Declaration,
  testIfRootHostForV4,
  usesTailwindcssV4ContentVariable,
} from '@/compat/tailwindcss-v4'
import postcssHtmlTransform from '@/html-transform'
import { commonChunkPreflight, remakeCssVarSelector, testIfVariablesScope } from '@/mp'
import { normalizeCssOptions, createOptionsResolver } from '@/options-resolver'
import { createColorFunctionalFallback } from '@/plugins/colorFunctionalFallback'
import { getCustomPropertyCleaner } from '@/plugins/getCustomPropertyCleaner'
import { postcssWeappTailwindcssPostPlugin, reorderVariableDeclarations } from '@/plugins/post'
import { createFallbackPlaceholderCleaner, createFallbackPlaceholderReplacer, createRootSpecificityCleaner } from '@/plugins/post/specificity-cleaner'
import { postcssWeappTailwindcssPrePlugin } from '@/plugins/pre'
import {
  collectCssInlineSourceCandidates,
  createTailwindSourceEntryMatcher,
  expandInlineSourceCandidatePattern,
  isFileExcludedByTailwindSourceEntries,
  isFileMatchedByTailwindSourceEntries,
  normalizeLegacyContentEntries,
  parseConfigParam,
  parseSourceFileParam,
  resolveSourceScanPath,
  toPosixPath,
} from '@/source-scan'
import { isNotLastChildPseudo, normalizeSpacingDeclarations } from '@/selectorParser/spacing'
import { appendRuleSelector, assignRuleSelectors } from '@/utils/selector-guard'
import * as entry from '../src/index'
import * as selectorExports from '../src/selectorParser'
import { createPlugin, createPlugins } from './plugins/utils'
import { getFixture } from './utils'

const WHITESPACE_REGEX = /\s+/g
const MARGIN_RIGHT_LITERAL_REGEX = /margin-right:\s*1px/g
const COLOR_DECLARATION_REGEX = /color:/g
const RGBA_COMPACT_REGEX = /rgba\(1,2,3,0\.5\)/

describe('entry exports', () => {
  it('loads core entry points', async () => {
    expect(typeof entry.createStylePipeline).toBe('function')
    expect(typeof selectorExports.getFallbackRemove).toBe('function')
    await import('../src/types')
  })
})

describe('options resolver edge cases', () => {
  it('mirrors nested css options and caches simple override objects', () => {
    const base = normalizeCssOptions({
      cssOptions: {
        platform: 'mp-weixin',
        px2rpx: false,
      },
    } as any)
    expect(base.platform).toBe('mp-weixin')
    expect(base.px2rpx).toBe(false)

    const mirrored = normalizeCssOptions({ platform: 'h5' } as any, true)
    expect(mirrored.cssOptions?.platform).toBe('h5')

    const resolver = createOptionsResolver({
      isMainChunk: true,
      cssPreflight: false,
      cssOptions: {
        rem2rpx: false,
      },
    } as any)
    const empty = {}
    expect(resolver.resolve(empty)).toBe(resolver.resolve(empty))

    const simple = {
      isMainChunk: false,
      majorVersion: 4,
      cssRemoveProperty: false,
      cssRemoveHoverPseudoClass: true,
      uniAppX: true,
      cssPreflightRange: 'all',
      injectAdditionalCssVarScope: false,
      rem2rpx: false,
      px2rpx: true,
      unitsToPx: false,
      unitConversion: false,
      platform: 'mp-weixin',
      cssCalc: false,
      cssChildCombinatorReplaceValue: 'view',
      cssPreflight: false,
      autoprefixer: false,
    } as const
    expect(resolver.resolve(simple)).toBe(resolver.resolve({ ...simple }))

    const complex = { cssOptions: { platform: 'h5' }, postcssOptions: { plugins: [] } } as any
    expect(resolver.resolve(complex)).toBe(resolver.resolve(complex))
  })
})

describe('source scan edge cases', () => {
  it('matches positive and negative source entries', () => {
    const base = resolveSourceScanPath(process.cwd())
    const entries = [
      { base, pattern: 'src/**/*.ts', negated: false },
      { base, pattern: 'src/**/*.test.ts', negated: true },
    ]
    expect(toPosixPath(['a', 'b', 'c'].join(pathSeparatorForTest()))).toBe('a/b/c')
    expect(isFileMatchedByTailwindSourceEntries(`${base}/src/index.ts`, entries)).toBe(true)
    expect(isFileMatchedByTailwindSourceEntries(`${base}/src/index.test.ts`, entries)).toBe(false)
    expect(isFileExcludedByTailwindSourceEntries(`${base}/src/index.test.ts`, entries)).toBe(true)
    expect(isFileMatchedByTailwindSourceEntries(`${base}/src/index.ts`, [{ base, pattern: 'src/**/*.test.ts', negated: true }])).toBe(true)
    expect(createTailwindSourceEntryMatcher(undefined)).toBeUndefined()
    expect(createTailwindSourceEntryMatcher(entries)?.(`${base}/src/index.ts`)).toBe(true)
  })

  it('parses config/source params and expands inline source candidates', () => {
    expect(parseConfigParam('"./tailwind.config.ts"')).toBe('./tailwind.config.ts')
    expect(parseConfigParam('tailwind.config.ts')).toBeUndefined()
    expect(parseSourceFileParam('none')).toBeUndefined()
    expect(parseSourceFileParam('inline("bg-red-500")')).toBeUndefined()
    expect(parseSourceFileParam('not "./src"')).toEqual({ negated: true, sourcePath: './src' })

    expect(normalizeLegacyContentEntries(['./src/**/*.{vue,ts}', { files: './pages/**/*', relative: true }], '/root', {
      relativeBase: '/project',
    })).toEqual([
      { base: '/root', negated: false, pattern: 'src/**/*.{vue,ts}' },
      { base: '/project', negated: false, pattern: 'pages/**/*' },
    ])

    expect(expandInlineSourceCandidatePattern('p-{1..3}')).toEqual(['p-1', 'p-2', 'p-3'])
    expect(expandInlineSourceCandidatePattern('p-{3..1..1}')).toEqual(['p-3', 'p-2', 'p-1'])
    expect(expandInlineSourceCandidatePattern('p-{1..3..0}')).toEqual([])
    expect(expandInlineSourceCandidatePattern('hover:{bg,focus:{text,border}}-red')).toEqual([
      'hover:bg-red',
      'hover:focus:text-red',
      'hover:focus:border-red',
    ])

    const root = postcss.parse([
      '@source inline("p-{1..2} hover:{bg,text}-red");',
      '@source not inline("p-2");',
      '@source inline(bg-red-500);',
    ].join('\n'))
    const candidates = collectCssInlineSourceCandidates(root)
    expect([...candidates.included].sort()).toEqual(['hover:bg-red', 'hover:text-red', 'p-1'])
    expect([...candidates.excluded]).toEqual(['p-2'])
  })
})

describe('tailwindcss v4 compat helpers', () => {
  it('detects v4 support probes and normalizes declarations', () => {
    expect(isTailwindcssV4({ majorVersion: 4 })).toBe(true)
    expect(isTailwindcssV4({} as any)).toBe(false)

    const supports = new AtRule({
      name: 'supports',
      params: [
        '(-webkit-hyphens: none)',
        'and (margin-trim: inline)',
        'and (-moz-orient: inline)',
        'and (color: rgb(from red r g b))',
      ].join(' '),
    })
    expect(isTailwindcssV4ModernCheck(supports)).toBe(true)
    expect(isTailwindcssV4LinearGradientSupports(new AtRule({
      name: 'supports',
      params: '(background-image: linear-gradient(in lab, red, red))',
    }))).toBe(true)
    expect(isTailwindcssV4DisplayP3Supports(new AtRule({
      name: 'supports',
      params: '(color: color(display-p3 0 0 0%))',
    }))).toBe(true)
    expect(isTailwindcssV4DisplayP3Media(new AtRule({
      name: 'media',
      params: '(color-gamut: p3)',
    }))).toBe(true)
    expect(isTailwindcssV4DisplayP3Declaration(new Declaration({
      prop: 'color',
      value: 'color(display-p3 0 0 0)',
    }))).toBe(true)

    const gradientPosition = new Declaration({
      prop: '--tw-gradient-position',
      value: 'to right in oklab',
    })
    expect(normalizeTailwindcssV4Declaration(gradientPosition)).toBe(true)
    expect(gradientPosition.value).toBe('to right')

    const conicRoot = postcss.parse('.bg-conic{--tw-gradient-position:in oklab;background-image:conic-gradient(var(--tw-gradient-stops))}')
    const conicDecl = (conicRoot.first as Rule).first as Declaration
    expect(normalizeTailwindcssV4Declaration(conicDecl)).toBe(true)
    expect(conicDecl.value).toBe('from 0deg')

    const radius = new Declaration({ prop: 'border-radius', value: 'calc(infinity * 1px)' })
    expect(normalizeTailwindcssV4Declaration(radius)).toBe(true)
    expect(radius.value).toBe('9999px')

    const largeRadius = new Declaration({ prop: 'border-radius', value: '1e6px 12px' })
    expect(normalizeTailwindcssV4Declaration(largeRadius)).toBe(true)
    expect(largeRadius.value).toBe('9999px 12px')

    const unchanged = new Declaration({ prop: 'color', value: 'red' })
    expect(normalizeTailwindcssV4Declaration(unchanged)).toBe(false)

    const emptyTwVarFallback = new Declaration({
      prop: 'transform',
      value: 'translate(var(--tw-translate-x,))',
    })
    expect(normalizeTailwindcssV4Declaration(emptyTwVarFallback)).toBe(true)
    expect(emptyTwVarFallback.value).toBe('translate(var(--tw-translate-x, ))')

    const gradientPositionFallback = new Declaration({
      prop: 'background-image',
      value: 'linear-gradient(var(--tw-gradient-from-position))',
    })
    expect(normalizeTailwindcssV4Declaration(gradientPositionFallback)).toBe(true)
    expect(gradientPositionFallback.value).toContain('var(--tw-gradient-from-position, )')

    const gradientPositionEmptyFallback = new Declaration({
      prop: 'background-image',
      value: 'linear-gradient(var(--tw-gradient-to-position,))',
    })
    expect(normalizeTailwindcssV4Declaration(gradientPositionEmptyFallback)).toBe(true)
    expect(gradientPositionEmptyFallback.value).toContain('var(--tw-gradient-to-position, )')

    const gradientViaStops = new Declaration({
      prop: 'background-image',
      value: 'linear-gradient(var(--tw-gradient-via-stops, red, blue))',
    })
    expect(normalizeTailwindcssV4Declaration(gradientViaStops)).toBe(true)
    expect(gradientViaStops.value).toContain('var(--tw-gradient-via-stops, red), blue')

    const removedInitialViaStops = new Declaration({
      prop: '--tw-gradient-via-stops',
      value: 'initial',
    })
    const viaRoot = postcss.root()
    viaRoot.append(removedInitialViaStops)
    expect(normalizeTailwindcssV4Declaration(removedInitialViaStops)).toBe(true)
    expect(viaRoot.nodes).toHaveLength(0)
  })

  it('collects used variables and appends literal mini-program gradient fallbacks', () => {
    const root = postcss.parse([
      ':root,:host{--color-sky-500:#0ea5e9}',
      '@supports (color:red){:root,:host{--tw-space-y-reverse:1}}',
      'view,text,::before,::after{--tw-gradient-from:rgba(0,0,0,0)}',
      '.content::before{content:var(--tw-content)}',
      '.bg-linear{--tw-gradient-position:to right;background-image:linear-gradient(var(--tw-gradient-stops, red, blue))}',
      '.bg-radial{--tw-gradient-position:in oklab;background-image:radial-gradient(var(--tw-gradient-stops))}',
      '.bg-conic{--tw-gradient-position:in oklab;background-image:conic-gradient(var(--tw-gradient-stops))}',
      '.bg-comma{--tw-gradient-position:40deg, in oklab;background-image:linear-gradient(var(--tw-gradient-stops))}',
      '.bg-var{--tw-gradient-position:var(--angle);background-image:linear-gradient(var(--tw-gradient-stops))}',
      '.from-sky{--tw-gradient-from:var(--color-sky-500)}',
      '.via-white{--tw-gradient-via:white}',
      '.to-blue{--tw-gradient-to:blue}',
      '.from-40{--tw-gradient-from-position:40%}',
      '.via-60{--tw-gradient-via-position:60%}',
      '.to-90{--tw-gradient-to-position:90%}',
      '.bg-linear{background-image:linear-gradient(red, blue)}',
      '@property --tw-rotate { syntax: "*"; inherits: false; initial-value: 0deg; }',
    ].join('\n'))

    expect(testIfRootHostForV4(root.first as Rule)).toBe(true)
    expect(usesTailwindcssV4ContentVariable(root)).toBe(true)
    const used = collectUsedTailwindcssV4Variables(root)
    expect(used.has('--tw-gradient-from')).toBe(true)
    expect(used.has('--tw-rotate')).toBe(true)
    expect(createUsedCssVarsV4Nodes(new Set(['--tw-gradient-from', '--tw-gradient-via-stops'])).map(node => node.prop)).toEqual(['--tw-gradient-from'])
    expect(createMissingCssVarsV4Nodes(root, new Set(['--tw-gradient-from', '--tw-space-y-reverse'])).map(node => node.prop)).not.toContain('--tw-gradient-from')

    appendTailwindcssV4MiniProgramGradientRules(root)
    const css = root.toString()
    expect(css).toContain('.bg-radial.from-sky.to-blue{background-image:radial-gradient(at center, #0ea5e9, blue)}')
    expect(css).toContain('.bg-conic.from-sky.to-blue{background-image:conic-gradient(from 0deg, #0ea5e9, blue)}')
    expect(css).toContain('.bg-radial.from-sky.via-white.to-blue{background-image:radial-gradient(at center, #0ea5e9, white, blue)}')
    expect(css).toContain('.bg-radial.from-sky.from-40.via-white.via-60.to-blue.to-90')
    expect(css.match(/\.bg-linear\{background-image:linear-gradient\(red, blue\)\}/g)?.length).toBe(1)
    expect(css).not.toContain('.bg-comma.from-sky.to-blue')
    expect(css).not.toContain('.bg-var.from-sky.to-blue')
  })

  it('treats mixed default variable scopes as missing v4 defaults', () => {
    const root = postcss.parse([
      ':root,:host{',
      '  /* generated */',
      '  --tw-gradient-from:red;',
      '  color:red;',
      '}',
      '@supports (color:red){:root{--tw-gradient-to:blue}}',
    ].join('\n'))

    const missing = createMissingCssVarsV4Nodes(root, new Set(['--tw-gradient-from', '--tw-gradient-to']))
      .map(node => node.prop)

    expect(missing).toContain('--tw-gradient-from')
    expect(missing).toContain('--tw-gradient-to')
  })

  it('merges split gradient direction declarations within the same parent', () => {
    const root = postcss.parse([
      '.bg-gradient-to-r{background-image:linear-gradient(var(--tw-gradient-stops))}',
      '.bg-gradient-to-r{--tw-gradient-position:to right}',
      '@supports (background-image:linear-gradient(in lab, red, red)){',
      '.bg-gradient-to-r{--tw-gradient-position:to right in oklab}',
      '}',
      '.not-gradient{background-image:linear-gradient(red, blue)}',
    ].join('\n'))

    mergeTailwindcssV4GradientDirectionRules(root)
    const css = root.toString()
    expect(css.match(/\.bg-gradient-to-r/g)?.length).toBe(2)
    expect(css).toContain('--tw-gradient-position:to right;background-image:linear-gradient(var(--tw-gradient-stops))')
    expect(css).not.toContain('to right in oklab')
    expect(css).toContain('@supports')
    expect(css).toContain('.not-gradient')
  })
})

describe('style handler cache and plugin paths', () => {
  it('skips feature probing for user plugins and recomputes results', async () => {
    const styleHandler = entry.createStyleHandler({
      postcssOptions: {
        plugins: {
          appendDecl: {
            postcssPlugin: 'append-decl',
            Once(root: postcss.Root) {
              root.append(postcss.rule({
                selector: '.plugin-added',
                nodes: [new Declaration({ prop: 'display', value: 'block' })],
              }))
            },
          },
        },
      },
    } as any)

    const first = await styleHandler('.card{color:red}', { cssPreflight: false })
    const second = await styleHandler('.card{color:red}', { cssPreflight: false })
    expect(second).not.toBe(first)
    expect(second.css).toBe(first.css)
    expect(first.css).toContain('.plugin-added')
    expect(styleHandler.getPipeline({ cssPreflight: false })).toBeTruthy()
  })

  it('restores protected color-mix alpha placeholders for v4 processing', async () => {
    const styleHandler = entry.createStyleHandler({
      majorVersion: 4,
      cssPreflight: false,
    })
    const result = await styleHandler('.card{color:color-mix(in srgb, red 50%, transparent)}')
    expect(result.css).toContain('rgba(255, 0, 0, 0.5)')
    expect(result.css).not.toContain('__WEAPP_TW_COLOR_MIX_ALPHA')
  })

  it('covers combined pipeline branches across platform and selector options', async () => {
    const css = [
      '@layer utilities {',
      ':root{--brand:oklch(62.3% 0.214 259.815)}',
      '*,::before,::after{box-sizing:border-box}',
      'button{appearance:button}',
      '.container{width:100%}',
      '@media (min-width:640px){.container{max-width:640px}}',
      '.hover\\:text:hover{color:red}',
      '.space-y-2 > :not([hidden]) ~ :not([hidden]){margin-top:8rpx}',
      '.file::file-selector-button{color:red}',
      '.mix{color:color-mix(in oklab,var(--brand) 50%,transparent)}',
      '}',
      '@supports (color: color(display-p3 0 0 0%)){.p3{color:color(display-p3 0 0 0%)}}',
    ].join('\n')

    const miniProgram = entry.createStyleHandler({
      majorVersion: 4,
      cssRemoveHoverPseudoClass: true,
      cssChildCombinatorReplaceValue: ['view', 'text'],
      cssPreflight: {
        'box-sizing': 'border-box',
      },
    })
    const miniProgramResult = await miniProgram(css, {
      isMainChunk: true,
    })
    expect(miniProgramResult.css).toContain('view,text')
    expect(miniProgramResult.css).not.toContain(':hover')
    expect(miniProgramResult.css).not.toContain('file-selector-button')
    expect(miniProgramResult.css).not.toContain('display-p3')

    const uniAppX = entry.createStyleHandler({
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'silent',
      cssPreflight: false,
    })
    const uniAppXResult = await uniAppX([
      '.flex{display:flex}',
      '.grid{display:grid}',
      '.gap{gap:8px}',
      '.tag view{color:red}',
      '@media screen{.block{display:block}}',
    ].join('\n'), {
      isMainChunk: false,
    })
    expect(uniAppXResult.css).toContain('.flex')
    expect(uniAppXResult.css).not.toContain('display:grid')
    expect(uniAppXResult.css).not.toContain('@media')
  })
})

function pathSeparatorForTest() {
  return process.platform === 'win32' ? '\\' : '/'
}

describe('test helpers', () => {
  it('reads fixtures and exercises plugin utils', async () => {
    const content = await getFixture('css', 'v4.css')
    expect(content.length).toBeGreaterThan(0)

    const plugin = createPlugin('alpha')
    plugin.AtRule?.({} as any, {} as any)
    plugin.AtRuleExit?.({} as any, {} as any)
    plugin.Comment?.({} as any, {} as any)
    plugin.CommentExit?.({} as any, {} as any)
    plugin.Document?.({} as any, {} as any)
    plugin.DocumentExit?.({} as any, {} as any)

    const pluginObject = { postcssPlugin: 'beta' } as Plugin
    const merged = createPlugin(pluginObject)
    expect(merged.postcssPlugin).toBe('beta')
    expect(createPlugins(['gamma', pluginObject])).toHaveLength(2)
  })
})

describe('spacing helpers', () => {
  it('handles edge selector nodes and non-decls', () => {
    const invalidPseudo = { type: 'pseudo', value: ':not', nodes: [{ type: 'class' }] } as any
    expect(isNotLastChildPseudo(invalidPseudo)).toBe(false)

    const rule = postcss.parse('.a { /*c*/ margin-left: 1px; -webkit-margin-start: 2px }').first as Rule
    normalizeSpacingDeclarations(rule)
    expect(rule.toString()).not.toContain('-webkit-margin-start')
  })

  it('keeps one literal spacing declaration after mirror normalization', () => {
    const rule = postcss.parse(`
      .a {
        margin-left: 1px;
        margin-right: 1px;
        margin-right: var(--gap);
      }
    `).first as Rule

    normalizeSpacingDeclarations(rule)

    const css = rule.toString().replace(WHITESPACE_REGEX, ' ')
    expect(css.match(MARGIN_RIGHT_LITERAL_REGEX)?.length).toBe(1)
    expect(css).toContain('margin-left: var(--gap)')
  })
})

describe('specificity cleaner', () => {
  it('covers empty selector lists and spaced matches', () => {
    const emptyCleaner = createRootSpecificityCleaner({
      cssSelectorReplacement: { root: [' ', ''] },
      cssPresetEnv: { features: { 'is-pseudo-class': { specificityMatchingName: 'tw' } } },
    } as any)
    expect(emptyCleaner).toBeUndefined()

    const cleaner = createRootSpecificityCleaner({
      cssSelectorReplacement: { root: ['page'] },
      cssPresetEnv: { features: { 'is-pseudo-class': { specificityMatchingName: 'tw' } } },
    } as any)
    const rule = postcss.parse('page :not(.tw) { color: red }').first as Rule
    cleaner?.(rule)
    expect(rule.selector).toBe('page')

    const emptyRule = { selectors: [] } as Rule
    cleaner?.(emptyRule)
    expect(emptyRule.selectors).toEqual([])
  })

  it('cleans css-has-pseudo specificity placeholders from root scopes only', () => {
    const cleaner = createRootSpecificityCleaner({
      cssSelectorReplacement: { root: ['page', '.tw-root', 'wx-root-portal-content'] },
      cssPresetEnv: { features: {} },
    } as any)
    const rule = postcss.parse('page:not(.does-not-exist),.tw-root,wx-root-portal-content:not(.does-not-exist),.btn:not(.does-not-exist) { color: red }').first as Rule
    cleaner?.(rule)
    expect(rule.selector).toBe('page,.tw-root,wx-root-portal-content,.btn:not(.does-not-exist)')
  })

  it('cleans fallback placeholder selectors in rules and raw code', () => {
    const cleaner = createFallbackPlaceholderCleaner()
    const rule = postcss.parse('page:not(#n),view:not(#n),.demo:not(#n) { color: red }').first as Rule
    cleaner(rule)
    expect(rule.selector).toBe('page,view,.demo')

    const escapedRule = postcss.parse('page:not(#\\#),view:not(#\\#),.demo:not(#\\#) { color: red }').first as Rule
    cleaner(escapedRule)
    expect(escapedRule.selector).toBe('page,view,.demo')

    const replace = createFallbackPlaceholderReplacer()
    expect(replace('page:not(#n),.demo:not(#n){color:red;}')).toBe('page,.demo{color:red;}')
    expect(replace('page:not(#\\#),.demo:not(#\\#){color:red;}')).toBe('page,.demo{color:red;}')
  })
})

describe('selector guard', () => {
  it('skips no-op selector writes', () => {
    const rule = postcss.parse('.a,.b { color: red }').first as Rule
    expect(assignRuleSelectors(rule, ['.a', '.b'], {
      phase: 'test',
      reason: 'noop',
    })).toBe(false)
    expect(rule.selector).toBe('.a,.b')
  })

  it('throws when selector mutations fall back to a previous state', () => {
    const rule = postcss.parse('.a { color: red }').first as Rule
    expect(() => {
      assignRuleSelectors(rule, ['.b'], {
        phase: 'test',
        reason: 'step-1',
      })
      appendRuleSelector(rule, ':host', {
        phase: 'test',
        reason: 'step-2',
      })
      assignRuleSelectors(rule, ['.a'], {
        phase: 'test',
        reason: 'cycle',
      })
    }).toThrow(/postcss-selector-guard/)
  })

  it('throws when selector mutations exceed the safety limit', () => {
    const rule = postcss.parse('.s0 { color: red }').first as Rule

    expect(() => {
      for (let i = 1; i <= 25; i++) {
        appendRuleSelector(rule, `.s${i}`, {
          phase: 'stress',
          reason: `step-${i}`,
        })
      }
    }).toThrow(/postcss-selector-guard/)
  })
})

describe('post plugin edge cases', () => {
  it('cleans specificity when not main chunk', async () => {
    const post = postcssWeappTailwindcssPostPlugin({
      isMainChunk: false,
      cssSelectorReplacement: { root: 'page' },
      cssPresetEnv: { features: { 'is-pseudo-class': { specificityMatchingName: 'tw' } } },
    })
    const res = await postcss([post]).process('page:not(.tw) { color: red }', { from: undefined })
    expect(res.css).toContain('page')
    expect(res.css).not.toContain(':not(.tw)')
  })

  it('cleans fallback placeholders before final output', async () => {
    const post = postcssWeappTailwindcssPostPlugin({
      isMainChunk: true,
    })
    const res = await postcss([post]).process('page:not(#n),view:not(#n),.demo:not(#n) { color: red }', { from: undefined })
    expect(res.css).toBe('page,view,.demo { color: red }')

    const escaped = await postcss([post]).process('page:not(#\\#),view:not(#\\#),.demo:not(#\\#) { color: red }', { from: undefined })
    expect(escaped.css).toBe('page,view,.demo { color: red }')
  })

  it('skips non-declarations in dedupe flows', async () => {
    const rule = postcss.parse('.a { /*c*/ --x: 1; color: red; }').first as Rule
    reorderVariableDeclarations(rule)

    const post = postcssWeappTailwindcssPostPlugin({})
    const result = await postcss([post]).process('.a { /*c*/ margin-left: 1px; margin-inline-start: 1px; }', { from: undefined })
    expect(result.css).toContain('margin-left')
  })

  it('appends host only for default root selector groups', async () => {
    const post = postcssWeappTailwindcssPostPlugin({
      cssSelectorReplacement: { root: ['page', '.tw-root', 'wx-root-portal-content'] },
    })
    const result = await postcss([post]).process('page,.tw-root,wx-root-portal-content { color: red; }', { from: undefined })
    expect(result.css).toContain(':host')
  })

  it('skips host append for customized root selectors', async () => {
    const post = postcssWeappTailwindcssPostPlugin({
      cssSelectorReplacement: { root: ['page', '.custom-root', 'wx-root-portal-content'] },
    })
    const result = await postcss([post]).process('page,.custom-root,wx-root-portal-content { color: red; }', { from: undefined })
    expect(result.css).not.toContain(':host')
  })
})

describe('custom property cleaner', () => {
  it('keeps values without custom properties', async () => {
    const cleaner = getCustomPropertyCleaner({ cssCalc: { includeCustomProperties: ['--keep'] } } as any)
    const css = '.demo { color: red; color: blue; }'
    const result = await postcss([cleaner!]).process(css, { from: undefined })
    expect(result.css.match(COLOR_DECLARATION_REGEX)?.length).toBe(2)
  })
})

describe('color fallback edge cases', () => {
  it('skips invalid rgb shapes', async () => {
    const plugin = createColorFunctionalFallback()
    const noColors = await postcss([plugin]).process('.a { color: rgb(/ 0.5) }', { from: undefined })
    expect(noColors.css).toContain('rgb(/ 0.5)')

    const tooFew = await postcss([plugin]).process('.b { color: rgb(1 2 / 0.5) }', { from: undefined })
    expect(tooFew.css).toContain('rgb(1 2 / 0.5)')

    const commaSeparated = await postcss([plugin]).process('.c { color: rgb(1, 2, 3 / 0.5) }', { from: undefined })
    expect(commaSeparated.css).toContain('rgba(1, 2, 3, 0.5)')

    const spaced = await postcss([plugin]).process('.d { color: rgb( 1 2 3 / 0.5 ) }', { from: undefined })
    expect(spaced.css.replace(WHITESPACE_REGEX, '')).toMatch(RGBA_COMPACT_REGEX)
  })
})

describe('pre plugin edge cases', () => {
  it('removes hover media without nodes', () => {
    const pre = postcssWeappTailwindcssPrePlugin({})
    const handler = (pre as Plugin).AtRule as ((node: AtRule) => void) | undefined
    const root = postcss.root()
    const atRule = new AtRule({ name: 'media', params: '(hover:hover)' })
    root.append(atRule)
    handler?.(atRule)
    expect(root.nodes?.length).toBe(0)
  })

  it('keeps layer declarations until the unified consumer runs', () => {
    const pre = postcssWeappTailwindcssPrePlugin({})
    const handler = (pre as Plugin).AtRule as ((node: AtRule) => void) | undefined
    const once = (pre as Plugin).Once as ((root: postcss.Root) => void) | undefined
    const root = postcss.root()
    const layer = new AtRule({ name: 'layer', params: 'utilities', nodes: [] })
    root.append(layer)
    handler?.(layer)
    expect(root.nodes?.length).toBe(1)
    once?.(root)
    expect(root.nodes?.length).toBe(0)

    const propertiesRoot = postcss.parse('@layer properties {}')
    once?.(propertiesRoot)
    expect(propertiesRoot.nodes).toHaveLength(0)
  })
})

describe('html transform platforms', () => {
  it('leaves quickapp selectors untouched', async () => {
    const css = 'view { color: red }'
    const result = await postcss([postcssHtmlTransform({ platform: 'quickapp' })]).process(css, { from: undefined })
    expect(result.css).toBe(css)
  })
})

describe('mp helpers', () => {
  it('injects preflight into variable scopes', () => {
    const rule = postcss.parse('::before,::after { --tw-a:1; --tw-b:2 }').first as Rule
    expect(testIfVariablesScope(rule)).toBe(true)
    const remade = remakeCssVarSelector(['.x'], { cssSelectorReplacement: { universal: ['view'] } } as any)
    expect(remade[0]).toBe('*')
    const beforeCount = rule.nodes?.length ?? 0
    const inject = () => [new Declaration({ prop: 'color', value: 'blue' })]
    commonChunkPreflight(rule, { cssInjectPreflight: inject } as any)
    expect(rule.prev()).toBeUndefined()
    expect(rule.nodes?.some(node => node.type === 'decl' && node.prop === 'color' && node.value === 'blue')).toBe(true)
    expect(rule.nodes?.length ?? 0).toBeGreaterThan(beforeCount)
  })
})
