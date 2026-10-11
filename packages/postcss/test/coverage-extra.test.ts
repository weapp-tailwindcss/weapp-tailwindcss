import type { Plugin } from 'postcss'
import postcss, { Declaration, Rule } from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import {
  appendTailwindcssV4MiniProgramGradientRules,
  collectUsedTailwindcssV4Variables,
  createMissingCssVarsV4Nodes,
  createUsedCssVarsV4Nodes,
  isTailwindcssV4DisplayP3Declaration,
  isTailwindcssV4DisplayP3Media,
  isTailwindcssV4DisplayP3Supports,
  isTailwindcssV4LinearGradientSupports,
  isTailwindcssV4ModernCheck,
  mergeTailwindcssV4GradientDirectionRules,
  normalizeTailwindcssV4Declaration,
  normalizeTailwindcssV4InfinityCalcCss,
  usesTailwindcssV4ContentVariable,
} from '@/compat/tailwindcss-v4'
import { protectDynamicColorMixAlpha } from '@/compat/color-mix'
import { stripUnsupportedNodeForUniAppX } from '@/compat/uni-app-x'
import { fingerprintOptions } from '@/fingerprint'
import { createStyleHandler } from '@/handler'
import postcssHtmlTransform from '@/html-transform'
import { commonChunkPreflight, makePseudoVarRule, remakeCssVarSelector, testIfTwBackdrop } from '@/mp'
import { createOptionsResolver } from '@/options-resolver'
import { createStylePipeline } from '@/pipeline'
import { createColorFunctionalFallback } from '@/plugins/colorFunctionalFallback'
import { createContext } from '@/plugins/ctx'
import { getCustomPropertyCleaner } from '@/plugins/getCustomPropertyCleaner'
import { postcssWeappTailwindcssPostPlugin, reorderVariableDeclarations } from '@/plugins/post'
import { removeRedundantTransitionPropertyFallbacks } from '@/plugins/post/decl-dedupe'
import { postcssWeappTailwindcssPrePlugin } from '@/plugins/pre'
import {
  composeIsPseudoAst,
  getCombinatorSelectorAst,
  getFallbackRemove,
  isOnlyBeforeAndAfterPseudoElement,
  mklist,
  ruleTransformSync,
} from '@/selectorParser'
import { reorderLiteralFirst } from '@/utils/decl-order'
import { hasTwVars } from '@/utils/tw-vars'

const COLOR_DECLARATION_REGEX = /color:/g

describe('utility coverage helpers', () => {
  it('fingerprintOptions handles anonymous functions', () => {
    const anonymous = () => {}
    const anonResult = fingerprintOptions(anonymous)
    expect(fingerprintOptions(anonymous)).toBe(anonResult)

    const proxyFn = new Proxy(() => {}, {
      get(target, prop, receiver) {
        if (prop === 'name') {
          return ''
        }
        return Reflect.get(target, prop, receiver)
      },
    })
    expect(fingerprintOptions(proxyFn)).not.toBe(anonResult)
    expect(fingerprintOptions(proxyFn)).toBe(fingerprintOptions(proxyFn))
  })

  it('hasTwVars handles rules without nodes', () => {
    const emptyRule = new Rule({ selector: '.foo' })
    expect(hasTwVars(emptyRule, 1)).toBe(false)
  })

  it('reorderLiteralFirst early-return paths are covered', () => {
    const literalRule = postcss.parse('.foo { color: red }').first as Rule
    const declarations = literalRule.nodes as Declaration[]
    reorderLiteralFirst(literalRule, declarations, decl => decl.value.includes('var('))
    const variablesOnly = postcss.parse('.bar { --x: 1; --y: 2 }').first as Rule
    const vars = variablesOnly.nodes as Declaration[]
    reorderLiteralFirst(variablesOnly, vars, decl => decl.value.includes('var('))
    expect(variablesOnly.toString()).toContain('--x')
  })

  it('options resolver caches by reference and fingerprint', () => {
    const baseOptions = { cssPresetEnv: { features: {}, autoprefixer: { add: false } } }
    const resolver = createOptionsResolver(baseOptions as any)
    const overrides = { cssRemoveHoverPseudoClass: true }
    const first = resolver.resolve(overrides)
    const cachedByRef = resolver.resolve(overrides)
    expect(cachedByRef).toBe(first)
    const cachedByKey = resolver.resolve({ cssRemoveHoverPseudoClass: true })
    expect(cachedByKey).toBe(first)
  })

  it('context exposes isVariablesScope utilities', () => {
    const ctx = createContext()
    const rule = new Rule({ selector: '.scope' })
    ctx.markVariablesScope(rule as any)
    expect(ctx.isVariablesScope(rule as any)).toBe(true)
  })
})

describe('html transform edge cases', () => {
  it('covers h5 selectors and cursor removal', async () => {
    const result = await postcss([
      postcssHtmlTransform({ platform: 'h5', removeCursorStyle: true }),
    ]).process('view { cursor: pointer; }', { from: undefined })
    expect(result.css).toContain('taro-view-core')
    expect(result.css).not.toContain('cursor')

    const plugin = postcssHtmlTransform({ platform: 'h5', removeCursorStyle: true }) as Plugin
    const rule = new Rule({ selector: 'view' })
    rule.append(new Declaration({ prop: 'cursor', value: 'pointer' }))
    const ruleHandler = plugin.Rule as ((node: Rule) => void) | undefined
    ruleHandler?.(rule)
    const declHandler = plugin.Declaration as ((node: Declaration) => void) | undefined
    declHandler?.(rule.first as Declaration)
    expect(rule.selector).toBe('taro-view-core')
    expect((rule.nodes as Declaration[]).length).toBe(0)
  })

  it('skips work when platform has no walker', async () => {
    const css = '.foo { color: red }'
    const output = await postcss([postcssHtmlTransform({ platform: 'rn' })]).process(css, { from: undefined })
    expect(output.css).toBe(css)
  })
})

describe('mp helpers', () => {
  it('remakes css var selectors with all cases', () => {
    const baseSelectors = ['.foo']
    const withAll = remakeCssVarSelector([...baseSelectors], { cssPreflightRange: 'all' } as any)
    expect(withAll).toContain(':not(not)')

    const withArrayUniversal = remakeCssVarSelector([...baseSelectors], {
      cssSelectorReplacement: { universal: ['view', 'text'] },
    } as any)
    expect(withArrayUniversal[0]).toBe('*')

    const withStringUniversal = remakeCssVarSelector([...baseSelectors], {
      cssSelectorReplacement: { universal: 'view' },
    } as any)
    expect(withStringUniversal[0]).toBe('*')
  })

  it('creates pseudo variable rules and detects backdrop variable scopes', () => {
    const pseudoRule = makePseudoVarRule()
    expect(pseudoRule.selector).toBe('::before,::after')
    expect(pseudoRule.toString()).toContain('--tw-content: ""')

    const backdropRule = postcss.parse('::backdrop { --tw-backdrop-blur: blur(4px); --tw-backdrop-brightness: brightness(1); }').first as Rule
    expect(testIfTwBackdrop(backdropRule)).toBe(true)

    const emptyBackdropRule = postcss.parse('::backdrop { color: red; }').first as Rule
    expect(testIfTwBackdrop(emptyBackdropRule)).toBe(false)
  })

  it('injects preflight chunks and additional scopes', () => {
    const beforeAfterRule = postcss.parse('::before,::after { --tw-a:1; --tw-b:2 }').first as Rule
    const inject = () => [new Declaration({ prop: 'color', value: 'blue' })]
    commonChunkPreflight(beforeAfterRule, { cssInjectPreflight: inject } as any)
    expect(isOnlyBeforeAndAfterPseudoElement(beforeAfterRule)).toBe(true)
    expect(beforeAfterRule.nodes?.some(node => node.type === 'decl' && node.prop === 'color' && node.value === 'blue')).toBe(true)

    const root = postcss.parse([
      ':root,:host { --color-red-500: red; }',
      '.shadow { box-shadow: var(--tw-shadow); }',
    ].join('\n'))
    const rootRule = root.first as Rule
    commonChunkPreflight(rootRule, {
      majorVersion: 4,
      injectAdditionalCssVarScope: true,
      cssInjectPreflight: inject,
    } as any)
    expect(rootRule.prev()?.type).toBe('rule')
    expect(rootRule.prev()?.toString()).toContain('color: blue')
  })

  it('rewrites uni-app-x variable scopes with configured carrier selectors', () => {
    const rule = postcss.parse('*,::before { --tw-shadow: 0 0 #0000; --tw-ring-color: currentColor; }').first as Rule
    const inject = () => [new Declaration({ prop: 'box-sizing', value: 'border-box' })]

    commonChunkPreflight(rule, {
      uniAppX: true,
      cssInjectPreflight: inject,
      cssSelectorReplacement: {
        universal: 'uv-view',
      },
    } as any)

    expect(rule.selectors).toEqual(['uv-view'])
    expect(rule.toString()).toContain('box-sizing: border-box')
  })

  it('uses default uni-app-x variable carriers for additional Tailwind v4 scopes', () => {
    const root = postcss.parse(`
      :root,:host {
        --tw-shadow: 0 0 #0000;
        --color-blue-500: #3b82f6;
      }
      .shadow {
        box-shadow: var(--tw-shadow);
      }
    `)
    const rootRule = root.first as Rule

    commonChunkPreflight(rootRule, {
      majorVersion: 4,
      uniAppX: true,
      injectAdditionalCssVarScope: true,
    } as any)

    expect((rootRule.prev() as Rule).selectors).toEqual(['view', 'text'])
    expect(rootRule.prev()?.toString()).toContain('--tw-shadow')
  })
})

describe('compat helpers', () => {
  it('normalizes Tailwind v4 infinity radii before preprocessors parse generated CSS', () => {
    const css = normalizeTailwindcssV4InfinityCalcCss(`
      .rounded-full { border-radius: calc(infinity * 1px); }
      .rounded-r-full {
        border-top-right-radius: CALC( infinity * .5rpx );
        border-bottom-right-radius: calc(infinity * 100.1px);
      }
    `)

    expect(css).not.toContain('infinity')
    expect(css.match(/9999px/g)).toHaveLength(3)
  })

  it('clamps non-finite radii in v4 normalizer', () => {
    const decl = new Declaration({ prop: 'border-radius', value: '1e309px' })
    const changed = normalizeTailwindcssV4Declaration(decl)
    expect(changed).toBe(true)
    expect(decl.value).toBe('9999px')
  })

  it('removes Tailwind v4 oklab gradient suffix without leaving trailing spaces', () => {
    const decl = new Declaration({ prop: '--tw-gradient-position', value: 'to right in oklab' })
    const changed = normalizeTailwindcssV4Declaration(decl)
    expect(changed).toBe(true)
    expect(decl.value).toBe('to right')
  })

  it('adds comma-space empty fallbacks to Tailwind v4 gradient position variables', () => {
    const decl = new Declaration({
      prop: '--tw-gradient-stops',
      value: 'var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))',
    })
    const changed = normalizeTailwindcssV4Declaration(decl)

    expect(changed).toBe(true)
    expect(decl.value).toBe('var(--tw-gradient-via-stops, var(--tw-gradient-position)), var(--tw-gradient-from) var(--tw-gradient-from-position, ), var(--tw-gradient-to) var(--tw-gradient-to-position, )')
    expect(decl.value).not.toContain('var(--tw-gradient-from-position),')
    expect(decl.value).not.toContain('var(--tw-gradient-to-position),')
  })

  it('normalizes comma-only Tailwind v4 gradient empty fallbacks to comma-space fallbacks', () => {
    const decl = new Declaration({
      prop: '--tw-gradient-stops',
      value: 'var(--tw-gradient-via-stops, var(--tw-gradient-position)), var(--tw-gradient-from) var(--tw-gradient-from-position,), var(--tw-gradient-to) var(--tw-gradient-to-position,)',
    })
    const changed = normalizeTailwindcssV4Declaration(decl)

    expect(changed).toBe(true)
    expect(decl.value).toContain('var(--tw-gradient-from-position, )')
    expect(decl.value).toContain('var(--tw-gradient-to-position, )')
    expect(decl.value).not.toContain('var(--tw-gradient-from-position),')
    expect(decl.value).not.toContain('var(--tw-gradient-to-position);')
  })

  it('keeps explicit Tailwind v4 gradient position fallbacks unchanged', () => {
    const decl = new Declaration({
      prop: '--tw-gradient-stops',
      value: 'var(--tw-gradient-from) var(--tw-gradient-from-position, 10%), var(--tw-gradient-to) var(--tw-gradient-to-position, 90%)',
    })
    const changed = normalizeTailwindcssV4Declaration(decl)

    expect(changed).toBe(false)
    expect(decl.value).toBe('var(--tw-gradient-from) var(--tw-gradient-from-position, 10%), var(--tw-gradient-to) var(--tw-gradient-to-position, 90%)')
  })

  it('does not inject Tailwind v4 gradient via stops as ordinary mini-program defaults', () => {
    const root = postcss.parse('.from-cyan-500{--tw-gradient-stops:var(--tw-gradient-via-stops,var(--tw-gradient-position),var(--tw-gradient-from),var(--tw-gradient-to))}')
    const nodes = createMissingCssVarsV4Nodes(root, collectUsedTailwindcssV4Variables(root))
    const props = nodes.map(node => node.prop)

    expect(props).toContain('--tw-gradient-stops')
    expect(props).not.toContain('--tw-gradient-via-stops')
  })

  it('collects Tailwind v4 variables from @property and respects scoped defaults', () => {
    const root = postcss.parse(`
      @property --tw-shadow {
        syntax: "*";
        inherits: false;
        initial-value: 0 0 #0000;
      }
      @supports (color: red) {
        page {
          --tw-gradient-from-position: 10%;
        }
      }
      view,text,::after,::before {
        --tw-gradient-to-position: 90%;
      }
      page {
        --tw-gradient-stops: var(--tw-gradient-from), var(--tw-gradient-to);
        color: red;
      }
      .before\\:content {
        content: var(--tw-content);
      }
    `)
    const used = collectUsedTailwindcssV4Variables(root)
    const usedDefaults = createUsedCssVarsV4Nodes(used)
    const missingDefaults = createMissingCssVarsV4Nodes(root, used)
    const usedProps = usedDefaults.map(node => node.prop)
    const missingProps = missingDefaults.map(node => node.prop)

    expect(used.has('--tw-shadow')).toBe(true)
    expect(used.has('--tw-gradient-stops')).toBe(true)
    expect(usedProps).toContain('--tw-gradient-to-position')
    expect(missingProps).not.toContain('--tw-gradient-to-position')
    expect(missingProps).toContain('--tw-gradient-from-position')
    expect(usesTailwindcssV4ContentVariable(root)).toBe(true)
  })

  it('removes Tailwind v4 initial gradient via stops for mini-program fallback support', () => {
    const decl = new Declaration({ prop: '--tw-gradient-via-stops', value: 'initial' })
    const changed = normalizeTailwindcssV4Declaration(decl)

    expect(changed).toBe(true)
    expect(decl.parent).toBeUndefined()
  })

  it('expands Tailwind v4 gradient stop background for mini-program runtime', () => {
    const decl = new Declaration({ prop: 'background-image', value: 'linear-gradient(var(--tw-gradient-stops))' })
    const changed = normalizeTailwindcssV4Declaration(decl)

    expect(changed).toBe(false)
    expect(decl.value).toBe('linear-gradient(var(--tw-gradient-stops))')
  })

  it('merges split Tailwind v4 gradient direction rules after oklab downgrade', () => {
    const root = postcss.parse(`
      .bg-linear-to-r {
        background-image: linear-gradient(var(--tw-gradient-stops));
      }
      .bg-linear-to-r {
        --tw-gradient-position: to right in oklab;
      }
      .bg-linear-to-r\\/oklch {
        background-image: linear-gradient(var(--tw-gradient-stops));
        --tw-gradient-position: to right in oklch shorter hue;
      }
      .bg-linear-to-r\\/hsl {
        background-image: linear-gradient(var(--tw-gradient-stops));
        --tw-gradient-position: to right in hsl;
      }
    `)
    root.walkDecls((decl) => {
      normalizeTailwindcssV4Declaration(decl)
    })
    mergeTailwindcssV4GradientDirectionRules(root)

    const css = root.toString()
    const topLevelRules = root.nodes.filter((node): node is Rule => {
      return node.type === 'rule' && node.selector === '.bg-linear-to-r'
    })

    expect(topLevelRules).toHaveLength(1)
    expect(css).toContain('--tw-gradient-position: to right;')
    expect(css).toContain('background-image: linear-gradient(var(--tw-gradient-stops));')
    expect(css).not.toContain('in oklab')
    expect(css).not.toContain('in oklch')
    expect(css).not.toContain('in hsl')
    expect(css).not.toContain('shorter hue')
  })

  it('does not append duplicate literal Tailwind v4 mini-program gradient rules', () => {
    const root = postcss.parse(`
      page {
        --color-cyan-500: rgb(0, 182, 212);
        --color-blue-500: rgb(50, 128, 255);
      }
      .bg-linear-to-r {
        --tw-gradient-position: to right;
      }
      .from-cyan-500 {
        --tw-gradient-from: var(--color-cyan-500);
      }
      .to-blue-500 {
        --tw-gradient-to: var(--color-blue-500);
      }
      .bg-linear-to-r.from-cyan-500.to-blue-500 {
        background-image: linear-gradient(to right, rgb(0, 182, 212) 0%, rgb(50, 128, 255) 100%);
      }
    `)

    appendTailwindcssV4MiniProgramGradientRules(root)

    expect(root.toString().match(/\.bg-linear-to-r\.from-cyan-500\.to-blue-500\s*\{/g)).toHaveLength(1)
  })

  it('covers Tailwind v4 feature guard predicates', () => {
    expect(isTailwindcssV4ModernCheck(new postcss.AtRule({
      name: 'supports',
      params: '((-webkit-hyphens: none) and (not (margin-trim: inline))) or ((-moz-orient: inline) and (not (color: rgb(from red r g b))))',
    }))).toBe(true)
    expect(isTailwindcssV4ModernCheck(new postcss.AtRule({ name: 'media', params: '(min-width: 1px)' }))).toBe(false)
    expect(isTailwindcssV4LinearGradientSupports(new postcss.AtRule({
      name: 'supports',
      params: '(background-image: linear-gradient(in lab, red, red))',
    }))).toBe(true)
    expect(isTailwindcssV4DisplayP3Supports(new postcss.AtRule({
      name: 'supports',
      params: '(color: color(display-p3 0 0 0%))',
    }))).toBe(true)
    expect(isTailwindcssV4DisplayP3Media(new postcss.AtRule({
      name: 'media',
      params: '(color-gamut: p3)',
    }))).toBe(true)
    expect(isTailwindcssV4DisplayP3Declaration(new Declaration({
      prop: 'color',
      value: 'color(display-p3 1 0 0)',
    }))).toBe(true)
  })

  it('normalizes Tailwind v4 gradient fallbacks and direction edge cases', () => {
    const emptyFallback = new Declaration({
      prop: 'box-shadow',
      value: 'var(--tw-shadow,)',
    })
    expect(normalizeTailwindcssV4Declaration(emptyFallback)).toBe(true)
    expect(emptyFallback.value).toBe('var(--tw-shadow, )')

    const alreadySpacedFallback = new Declaration({
      prop: 'box-shadow',
      value: 'var(--tw-shadow, )',
    })
    expect(normalizeTailwindcssV4Declaration(alreadySpacedFallback)).toBe(false)

    const nestedStops = new Declaration({
      prop: '--tw-gradient-stops',
      value: 'linear-gradient(var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from), var(--tw-gradient-to)))',
    })
    expect(normalizeTailwindcssV4Declaration(nestedStops)).toBe(true)
    expect(nestedStops.value).toContain('linear-gradient(var(--tw-gradient-via-stops, var(--tw-gradient-position)), var(--tw-gradient-from), var(--tw-gradient-to))')

    const noCommaStops = new Declaration({
      prop: '--tw-gradient-stops',
      value: 'var(--tw-gradient-via-stops)',
    })
    expect(normalizeTailwindcssV4Declaration(noCommaStops)).toBe(false)

    const radialRule = postcss.parse('.bg-radial{--tw-gradient-position:in oklab;background-image:radial-gradient(var(--tw-gradient-stops))}').first as Rule
    const radialPosition = radialRule.nodes?.[0] as Declaration
    expect(normalizeTailwindcssV4Declaration(radialPosition)).toBe(true)
    expect(radialPosition.value).toBe('at center')

    const conicRule = postcss.parse('.bg-conic{--tw-gradient-position:in oklab;background-image:conic-gradient(var(--tw-gradient-stops))}').first as Rule
    const conicPosition = conicRule.nodes?.[0] as Declaration
    expect(normalizeTailwindcssV4Declaration(conicPosition)).toBe(true)
    expect(conicPosition.value).toBe('from 0deg')

    const emptyLinearRule = postcss.parse('.bg-linear{--tw-gradient-position:in oklab;background-image:linear-gradient(var(--tw-gradient-stops))}').first as Rule
    const emptyLinearPosition = emptyLinearRule.nodes?.[0] as Declaration
    expect(normalizeTailwindcssV4Declaration(emptyLinearPosition)).toBe(true)
    expect(emptyLinearPosition.value).toBe('')

    const noBackgroundRule = postcss.parse('.bg-linear{--tw-gradient-position:in oklab}').first as Rule
    const noBackgroundPosition = noBackgroundRule.nodes?.[0] as Declaration
    expect(normalizeTailwindcssV4Declaration(noBackgroundPosition)).toBe(true)
    expect(noBackgroundPosition.value).toBe('')

    const commaOnlyFallback = new Declaration({
      prop: '--tw-gradient-stops',
      value: 'var(--tw-gradient-from) var(--tw-gradient-from-position,)',
    })
    expect(normalizeTailwindcssV4Declaration(commaOnlyFallback)).toBe(true)
    expect(commaOnlyFallback.value).toContain('var(--tw-gradient-from-position, )')
  })

  it('appends direct Tailwind v4 gradient fallback rules and skips variable/comma positions', () => {
    const root = postcss.parse(`
      :root,:host {
        --color-cyan-500: #06b6d4;
        --color-blue-500: #3b82f6;
      }
      .bg-linear-custom {
        --tw-gradient-position: var(--angle);
        background-image: linear-gradient(var(--tw-gradient-stops));
      }
      .bg-conic-list {
        --tw-gradient-position: from 45deg, red, blue;
        background-image: conic-gradient(var(--tw-gradient-stops));
      }
      .bg-radial-direct {
        --tw-gradient-position: at center;
        background-image: radial-gradient(var(--tw-gradient-stops, at 20% 30%, red, blue));
      }
      .from-cyan-500 {
        --tw-gradient-from: var(--color-cyan-500);
      }
      .to-blue-500 {
        --tw-gradient-to: var(--color-blue-500);
      }
    `)

    appendTailwindcssV4MiniProgramGradientRules(root)
    const css = root.toString()

    expect(css).toContain('.bg-radial-direct {\n        background-image: radial-gradient(at 20% 30%, red, blue)')
    expect(css).not.toContain('.bg-linear-custom.from-cyan-500.to-blue-500')
    expect(css).not.toContain('.bg-conic-list.from-cyan-500.to-blue-500')
  })

  it('appends positioned Tailwind v4 mini-program gradient combinations with via stops', () => {
    const root = postcss.parse(`
      :root,:host {
        --color-emerald-500: rgb(16, 185, 129);
        --color-blue-500: rgb(59, 130, 246);
      }
      .bg-linear-to-r {
        --tw-gradient-position: to right;
        background-image: linear-gradient(var(--tw-gradient-stops, var(--tw-gradient-position), var(--tw-gradient-from), var(--tw-gradient-to)));
      }
      .from-plain {
        --tw-gradient-from: #111827;
      }
      .from-10 {
        --tw-gradient-from-position: 10%;
      }
      .via-emerald-500 {
        --tw-gradient-via: var(--color-emerald-500);
      }
      .via-45 {
        --tw-gradient-via-position: 45%;
      }
      .to-blue-500 {
        --tw-gradient-to: var(--color-blue-500);
      }
      .to-90 {
        --tw-gradient-to-position: 90%;
      }
    `)

    appendTailwindcssV4MiniProgramGradientRules(root)
    const css = root.toString()

    expect(css).toContain('background-image: linear-gradient(var(--tw-gradient-position), var(--tw-gradient-from), var(--tw-gradient-to))')
    expect(css).toContain('.bg-linear-to-r.from-plain.via-emerald-500.to-blue-500')
    expect(css).toContain('linear-gradient(to right, #111827, rgb(16, 185, 129), rgb(59, 130, 246))')
    expect(css).toContain('.bg-linear-to-r.from-plain.from-10.via-emerald-500.via-45.to-blue-500.to-90')
    expect(css).toContain('linear-gradient(to right, #111827 10%, rgb(16, 185, 129) 45%, rgb(59, 130, 246) 90%)')
  })

  it('merges duplicate Tailwind v4 gradient direction rules around comments and unrelated declarations', () => {
    const root = postcss.parse(`
      .bg-linear-to-r {
        /* generated by Tailwind */
        color: inherit;
        --tw-gradient-position: to right;
      }
      .bg-linear-to-r {
        color: red;
        background-image: linear-gradient(var(--tw-gradient-stops));
      }
      @media (min-width: 1px) {
        .bg-linear-to-r {
          --tw-gradient-position: to left;
        }
      }
    `)

    mergeTailwindcssV4GradientDirectionRules(root)
    const css = root.toString()

    const topLevelRules = root.nodes.filter((node): node is Rule => {
      return node.type === 'rule' && node.selector === '.bg-linear-to-r'
    })

    expect(topLevelRules).toHaveLength(1)
    expect(css).toContain('--tw-gradient-position: to right;')
    expect(css).toContain('background-image: linear-gradient(var(--tw-gradient-stops));')
    expect(css).toContain('@media (min-width: 1px)')
  })

  it('handles uni-app-x unsupported nodes', () => {
    const removed = stripUnsupportedNodeForUniAppX({ type: 'tag', value: 'view', remove: vi.fn() } as any, { uniAppX: true })
    expect(removed).toBe(false)
    const untouched = stripUnsupportedNodeForUniAppX({ type: 'class', value: 'x' } as any, { uniAppX: true })
    expect(untouched).toBe(false)
  })
})

describe('plugin behaviours', () => {
  it('color functional fallback converts modern rgb', async () => {
    const res = await postcss([createColorFunctionalFallback()]).process('.foo { color: rgb(1 2 3 / 0.5) }', { from: undefined })
    expect(res.css).toContain('rgba(1, 2, 3, 0.5)')

    const unchanged = await postcss([createColorFunctionalFallback()]).process('.bar { color: rgb(1, 2, 3) }', { from: undefined })
    expect(unchanged.css).toContain('rgb(1, 2, 3)')
  })

  it('downgrades dynamic color-mix alpha values instead of restoring color-mix', async () => {
    const styleHandler = createStyleHandler({
      majorVersion: 4,
    })
    const source = `
      :root {
        --color-sky-500: #0ea5e9;
      }
      .foo {
        background-color: color-mix(in oklab, var(--color-sky-500) var(--my-alpha-value), transparent);
        color: color-mix(in oklab, var(--color-sky-500) 50%, transparent);
      }
    `
    const protectedSource = protectDynamicColorMixAlpha(source)
    expect(protectedSource.css).toContain('background-color: __weapp_tw_color_mix_0__')
    expect(protectedSource.css).toContain('color: rgba(14, 165, 233, 0.5)')
    const result = await styleHandler(protectedSource.css)
    const css = protectedSource.restore(result.css)

    expect(css).toContain('background-color: rgba(14, 165, 233, var(--my-alpha-value))')
    expect(css).toContain('color: rgba(14, 165, 233, 0.5)')
    expect(css).not.toContain('color-mix')
    expect(css).not.toContain('oklab')
  })

  it('downgrades static tailwind v4 color-mix alpha values to rgba', async () => {
    const styleHandler = createStyleHandler({
      majorVersion: 4,
    })
    const source = `
      :root {
        --color-white: #fff;
      }
      .foo {
        color: color-mix(in oklab, var(--color-white) 10%, transparent);
      }
    `
    const { css } = await styleHandler(source)
    expect(css).toContain('color: rgba(255, 255, 255, 0.1)')
    expect(css).not.toContain('color-mix(in oklab, var(--color-white) 10%, transparent)')
    expect(css).not.toContain('oklab')
  })

  it('custom property cleaner removes exact duplicates and preserves matched vars', async () => {
    const cleaner = getCustomPropertyCleaner({ cssCalc: { includeCustomProperties: ['--keep'] } } as any)
    expect(cleaner).toBeTruthy()
    const css = `
      .demo {
        color: red;
        color: red;
        color: var(--keep);
        color: var(--other);
      }
    `
    const result = await postcss([cleaner!]).process(css, { from: undefined })
    expect(result.css).toContain('var(--keep)')
    expect(result.css.match(COLOR_DECLARATION_REGEX)?.length).toBe(3)

    expect(getCustomPropertyCleaner({ cssCalc: false } as any)).toBeNull()
  })

  it('pre plugin removes hover media and empty layers', async () => {
    const pre = postcssWeappTailwindcssPrePlugin({})
    const result = await postcss([pre]).process('@media(hover:hover){} @layer empty {}', { from: undefined })
    expect(result.css).toBe('')

    const supports = await postcss([pre]).process('@supports (color-mix(in srgb, red 50%, blue 50%)) { a { color:red } }', { from: undefined })
    expect(supports.css).toBe('')
  })

  it('post plugin cleans specificity wrappers and removes empty rules', async () => {
    const post = postcssWeappTailwindcssPostPlugin({
      cssSelectorReplacement: { root: ['page'] },
      cssRemoveProperty: true,
      cssPresetEnv: {
        features: {
          'is-pseudo-class': {
            specificityMatchingName: 'tw',
          },
        },
      },
    })
    const css = `
      page:not(.tw){ color:red }
      .space{ margin-left:1px; margin-left:1px; margin-left:var(--v); }
      @property --foo {}
    `
    const res = await postcss([post]).process(css, { from: undefined })
    expect(res.css).not.toContain('property')
    expect(res.css).toContain('page')
  })

  it('reorders variable declarations directly', () => {
    const rule = postcss.parse('.a { margin-left: var(--v); margin-left: 2px; margin-left: 1px; }').first as Rule
    reorderVariableDeclarations(rule)
    const order = (rule.nodes as Declaration[]).map(d => d.value)
    expect(order.at(-1)).toBe('var(--v)')
  })

  it('dedupes redundant transition-property fallbacks with nested comma values', () => {
    const rule = postcss.parse([
      '.a {',
      '  transition-property: "opacity,transform";',
      '  transition-property: color, opacity;',
      '  transition-property: color, opacity, transform;',
      '  transition-property: color, var(--dynamic, opacity);',
      '}',
    ].join('\n')).first as Rule

    removeRedundantTransitionPropertyFallbacks(rule)
    const values = (rule.nodes as Declaration[]).map(decl => decl.value)

    expect(values).toEqual([
      '"opacity,transform"',
      'color, opacity, transform',
      'color, var(--dynamic, opacity)',
    ])
  })
})

describe('selector parser coverage', () => {
  it('composeIsPseudoAst covers string and array paths', () => {
    const stringAst = composeIsPseudoAst('view')
    const arrayAst = composeIsPseudoAst(['view'])
    expect(stringAst[0].type).toBe('tag')
    expect(arrayAst[0].type).toBe('tag')
  })

  it('fallback remover handles universals, empty where and direct transformSync calls', async () => {
    const fallback = getFallbackRemove(undefined, {})
    const parsed = await fallback.process('*:where([hidden]):not(#) {}')
    const output = typeof parsed === 'string' ? parsed : (parsed as { css: string }).css
    expect(output).not.toContain('*')

    const rule = postcss.parse(':where([hidden]){}').first as Rule
    fallback.transformSync(rule)
    expect(rule.selector).toBe('')
  })

  it('fallback transformSync handles string input', () => {
    const fallback = getFallbackRemove(undefined, {})
    const result = fallback.transformSync('a :where(.b)')
    expect(result).toBeUndefined()
  })

  it('rule transformer normalizes spacing and hover removals', () => {
    const options = {
      cssSelectorReplacement: { universal: ['view'], root: ['page'] },
      cssRemoveHoverPseudoClass: true,
      uniAppX: true,
      cssChildCombinatorReplaceValue: ['view'],
    }
    const root = postcss.parse(`
      .space-x-4 > :not(:last-child) { margin-top:1px; margin-top:1px; margin-top: var(--v); -webkit-margin-before:2px; }
      .hover\\:test:hover { color:red }
      :root { padding-inline-start:1px; }
    `)
    root.walkRules(rule => ruleTransformSync(rule, options as any))
    expect(root.toString()).not.toContain('-webkit-margin-before')
  })

  it('mklist and combinator helpers run through getCombinatorSelectorAst', () => {
    const options = { cssChildCombinatorReplaceValue: ['view'] } as any
    const combinatorAst = getCombinatorSelectorAst(options)
    expect(combinatorAst.length).toBe(3)
    const cloned = mklist(combinatorAst[0])
    expect(cloned[2]).toBeDefined()

    combinatorAst[0].value = 'mutated'
    const fresh = getCombinatorSelectorAst(options)
    expect(fresh[0].value).toBe('view')
  })
})

describe('pipeline edge cases', () => {
  const baseOptions = {
    cssPresetEnv: { features: {}, autoprefixer: { add: false } },
    cssCalc: false,
    px2rpx: false,
    rem2rpx: false,
  }

  it('normalizes user plugins defined as object', () => {
    const pipeline = createStylePipeline({
      ...baseOptions,
      postcssOptions: {
        plugins: {
          alpha: { postcssPlugin: 'alpha' },
        },
      },
    } as any)
    expect(pipeline.nodes[0]?.id).toBe('pre:user-0')
  })

  it('ignores invalid plugin definitions', () => {
    const pipeline = createStylePipeline({
      ...baseOptions,
      postcssOptions: {
        plugins: 'invalid',
      },
    } as any)
    expect(pipeline.nodes[0]?.id).toBe('pre:core')
  })
})
