import type { NativeSelectorRuleOptions } from '@/native/binding'
import type { IStyleHandlerOptions } from '@/types'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'
import postcss from 'postcss'
import psp from 'postcss-selector-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadNativeCssBinding } from '@/native/binding'
import { ruleTransformSync } from '@/selectorParser/rule-transformer'
import { normalizeSpacingDeclarations } from '@/selectorParser/spacing'
import { composeIsPseudo } from '@/shared'

afterEach(() => vi.unstubAllEnvs())

function nativeOptions(options: IStyleHandlerOptions): NativeSelectorRuleOptions {
  const child = options.cssChildCombinatorReplaceValue
  return {
    root: options.cssSelectorReplacement?.root ? composeIsPseudo(options.cssSelectorReplacement.root) : undefined,
    universal: options.cssSelectorReplacement?.universal ? composeIsPseudo(options.cssSelectorReplacement.universal) : undefined,
    child: typeof child === 'string' ? [child] : child?.length ? child : ['view'],
    removeHover: Boolean(options.cssRemoveHoverPseudoClass),
    removeActive: Boolean(options.cssRemoveActivePseudoClass),
    removeFocus: Boolean(options.cssRemoveFocusPseudoClass),
    uniAppX: Boolean(options.uniAppX),
  }
}

function legacy(selector: string, options: IStyleHandlerOptions) {
  vi.stubEnv('WEAPP_TW_NATIVE', 'off')
  const root = postcss.root({ nodes: [postcss.rule({ selector, nodes: [postcss.decl({ prop: 'margin-top', value: '1px' })] })] })
  root.walkRules(rule => ruleTransformSync(rule, { ...options }))
  return root.toString()
}

function compare(selector: string, options: IStyleHandlerOptions = {}, required = true) {
  vi.stubEnv('WEAPP_TW_NATIVE', 'required')
  const transform = new (loadNativeCssBinding()!.SelectorRuleTransformer)(nativeOptions(options))
  const result = transform.transform(selector)
  if (!required && result === null) {
    return false
  }
  expect(result, selector).not.toBeNull()
  const root = postcss.root({ nodes: [postcss.rule({ selector, nodes: [postcss.decl({ prop: 'margin-top', value: '1px' })] })] })
  const rule = root.first as postcss.Rule
  if (result!.remove) {
    rule.remove()
  }
  else {
    rule.selector = result!.selector
    if (result!.spacing) {
      normalizeSpacingDeclarations(rule)
    }
  }
  expect(root.toString(), `${selector} / ${JSON.stringify(options)}`).toBe(legacy(selector, options))
  vi.stubEnv('WEAPP_TW_NATIVE', 'required')
  const production = postcss.root({ nodes: [postcss.rule({ selector, nodes: [postcss.decl({ prop: 'margin-top', value: '1px' })] })] })
  production.walkRules(rule => ruleTransformSync(rule, { ...options }))
  expect(production.toString(), `production: ${selector}`).toBe(root.toString())
  return true
}

const optionCases: IStyleHandlerOptions[] = [
  {},
  { uniAppX: true },
  { cssRemoveHoverPseudoClass: true, cssRemoveActivePseudoClass: true, cssRemoveFocusPseudoClass: true },
  { cssSelectorReplacement: { root: ['page', '.tw-root'], universal: ['view', 'text'] }, cssChildCombinatorReplaceValue: ['view', 'text'] },
  { uniAppX: true, cssSelectorReplacement: { root: 'page', universal: 'view' }, cssChildCombinatorReplaceValue: 'view' },
]

describe('Rust 规则选择器 AST', () => {
  it('删除规则时仍保持调用方持有的 rule 和声明状态', () => {
    function run(mode: string) {
      vi.stubEnv('WEAPP_TW_NATIVE', mode)
      const root = postcss.parse('.a>:not(:last-child):checked{margin-top:1px;margin-bottom:2px}')
      const rule = root.first as postcss.Rule
      ruleTransformSync(rule, {})
      return { selector: rule.selector, detached: !rule.parent, declarations: rule.nodes.map(node => node.toString()), css: root.toString() }
    }
    expect(run('required')).toEqual(run('off'))
  })

  it.each([
    '.a:where(.b,.c):where(.d,.e)',
    '.a:where(:is(.b,.c))',
    '.a:where(.b)',
    '.a:where(.b:checked,.c)',
    '.a:where(:not(.b:checked),.c)',
    '.a:where(.b:before,.c)',
    '.a:not(:where(.b,.c))',
    '.a:not(:-webkit-any(:lang(ar),:lang(he))),.b:lang(en)',
    ':root *,.a:before,.b:after,::backdrop,.c::file-selector-button',
    '.a:not(),:where(),.b:where(,,),.c:has(:where())',
    '.a,',
    '.a,,',
    '.a,  ',
    ':where(.a,),.b:is(.c,)',
    '.a>.b:not(:last-child)',
    '.a>:not(:last-child)',
    ':where(.a>:not(:last-child))',
    '.a>:not(template)~:not([hidden])',
    '.a>:not([hidden])+ :not(template)',
    'button,input:where([type="button"],[type="reset"]):hover',
    '.a[ data-x = "a b" i ],.b[a = b i],.c[data-x = \'a b\' S]',
    ':where(select:is([multiple],[size])) optgroup',
    '.a:is(.b,.c):nth-child(2n + 1)',
    String.raw`.dark\:bg-black:where([data-mode="dark"],[data-mode="dark"] *)`,
    String.raw`:where(.child\:ring-white)>:where(:not(.not-child))`,
    '.中文\uD800:where(.😀,.b):focus-visible,.keep',
    String.raw`.a:where\78(.b,.c),.c:ch\65 cked,.b\61 r:where(.c)`,
    '[a=b I],[a=b S]',
  ])('语义矩阵：%s', (selector) => {
    for (const options of optionCases) {
      compare(selector, options)
    }
  })

  it('嵌套 pseudo 与多分支的有种子差分', () => {
    let selector = fc.constantFrom('.a', String.raw`.w-\[2px\]`, '*', '[hidden]', 'view', '&', '.b:checked', '.c:before', ':root')
    for (let depth = 0; depth < 3; depth++) {
      selector = fc.oneof(selector, fc.tuple(fc.constantFrom(':where', ':is', ':not', ':has', ':lang'), fc.array(selector, { minLength: 0, maxLength: 3 }), fc.constantFrom('', '.x', '.y>'))
        .map(([name, branches, prefix]) => `${prefix}${name}(${branches.join(',')})`))
    }
    fc.assert(fc.property(selector, fc.integer({ min: 0, max: optionCases.length - 1 }), (input, index) => {
      compare(input, optionCases[index]!)
    }), { seed: 20261005, numRuns: 2000 })
  })

  it('任意 UTF-16 类名与嵌套伪类组合保持输出和显式回退', () => {
    const className = fc.array(fc.integer({ min: 0, max: 65535 }), { minLength: 1, maxLength: 15 }).map((units) => {
      const node = psp.className({ value: '' })
      node.value = String.fromCharCode(...units)
      return node.toString()
    })
    fc.assert(fc.property(className, className, fc.integer({ min: 0, max: optionCases.length - 1 }), (a, b, index) => {
      const input = `${a}:where(${b},${b}:not(:disabled)),${b}:hover`
      const options = optionCases[index]!
      compare(input, options, false)
      const expected = legacy(input, options)
      vi.stubEnv('WEAPP_TW_NATIVE', 'required')
      const root = postcss.root({ nodes: [postcss.rule({ selector: input, nodes: [postcss.decl({ prop: 'margin-top', value: '1px' })] })] })
      root.walkRules(rule => ruleTransformSync(rule, { ...options }))
      expect(root.toString()).toBe(expected)
    }), { seed: 20261006, numRuns: 1000 })
  })

  it.each(['.a/*comment*/:where(.b,.c)', 'svg|a:where(.b,.c)', String.raw`.a\20 b:where(.b,.c)`])('未接管的 parser 边界完整回退：%s', (selector) => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const native = new (loadNativeCssBinding()!.SelectorRuleTransformer)(nativeOptions({}))
    expect(native.transform(selector)).toBeNull()
    const root = postcss.root({ nodes: [postcss.rule({ selector, nodes: [postcss.decl({ prop: 'margin-top', value: '1px' })] })] })
    root.walkRules(rule => ruleTransformSync(rule, {}))
    expect(root.toString()).toBe(legacy(selector, {}))
  })

  it('所有真实 CSS fixture 的规则和配置矩阵', () => {
    const directory = fileURLToPath(new URL('../fixtures/css', import.meta.url))
    let handled = 0
    let total = 0
    for (const file of readdirSync(directory, { recursive: true })) {
      if (typeof file !== 'string' || !file.endsWith('.css')) {
        continue
      }
      const root = postcss.parse(readFileSync(path.join(directory, file), 'utf8'))
      root.walkRules((rule) => {
        for (const options of optionCases) {
          handled += Number(compare(rule.selector, options, false))
          total++
        }
      })
    }
    expect(handled).toBeGreaterThan(1000)
    expect(handled / total).toBeGreaterThan(0.8)
  })
})
