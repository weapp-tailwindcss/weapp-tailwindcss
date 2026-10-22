import type { Result, Root, Rule } from 'postcss'
import postcss, { AtRule, Declaration } from 'postcss'
import { applyUniAppXUvueCompatibility } from '@/compat/uni-app-x-uvue'
import {
  appendTailwindcssV4MiniProgramGradientRules,
  collectUsedTailwindcssV4Variables,
  mergeTailwindcssV4GradientDirectionRules,
} from '@/compat/tailwindcss-v4'
import {
  createHoistInsertionAnchor,
  insertHoistedRules,
  mergeEquivalentHoistedRules,
} from '@/compat/mini-program-css/hoist'
import {
  removeDisplayP3Declarations,
  removeTailwindContainerMaxWidthMediaRules,
  removeTailwindContainerWidthRules,
  removeUnsupportedModernColorDeclarations,
} from '@/compat/mini-program-css/root-cleanups'
import { ruleTransformSync } from '@/selectorParser'

describe('defensive coverage edge cases', () => {
  it('handles sparse mini-program cleanup roots without throwing', () => {
    const sparseRule = {
      selectors: ['.container'],
      nodes: undefined,
    } as unknown as Rule
    const sparseAtRule = {
      name: 'media',
      params: '(color-gamut: p3)',
      raws: {},
      parent: undefined,
      remove() {
        this.removed = true
      },
    } as unknown as AtRule & { removed?: boolean }
    const sparseRoot = {
      walkRules(callback: (rule: Rule) => void) {
        callback(sparseRule)
      },
      walkAtRules(nameOrCallback: string | ((atRule: AtRule) => void), maybeCallback?: (atRule: AtRule) => void) {
        const callback = typeof nameOrCallback === 'function' ? nameOrCallback : maybeCallback
        callback?.(sparseAtRule)
      },
      walkDecls(callback: (decl: Declaration) => void) {
        callback({
          prop: 'color',
          value: 'color(display-p3 1 0 0)',
          parent: undefined,
          remove() {
            this.removed = true
          },
        } as unknown as Declaration)
      },
    } as unknown as Root

    expect(() => removeTailwindContainerWidthRules(sparseRoot)).not.toThrow()
    expect(() => removeTailwindContainerMaxWidthMediaRules(sparseRoot)).not.toThrow()
    expect(() => removeDisplayP3Declarations(sparseRoot)).not.toThrow()
    expect(() => removeUnsupportedModernColorDeclarations(sparseRoot)).not.toThrow()
    expect(sparseAtRule.removed).toBe(true)
  })

  it('handles sparse hoist inputs and empty rule node lists', () => {
    const sparseRoot = {
      nodes: undefined,
      walkRules() {},
    } as unknown as Root
    expect(createHoistInsertionAnchor(sparseRoot)).toBeUndefined()

    const root = postcss.root()
    const detachedAnchor = postcss.comment({ text: 'detached' })
    const rule = postcss.rule({ selector: 'view,text,::before,::after' })
    insertHoistedRules(root, [rule], detachedAnchor)
    expect(root.toString()).toBe('view,text,::before,::after {}')

    const first = postcss.rule({ selector: 'view,text,::before,::after' })
    const second = postcss.rule({ selector: 'text,view,::before,::after' })
    const merged = mergeEquivalentHoistedRules([first, second])
    expect(merged).toHaveLength(1)
  })

  it('covers tailwind v4 gradient branches without appending duplicates', () => {
    const variables = collectUsedTailwindcssV4Variables(postcss.parse('@property --x { syntax: "*"; }'))
    expect(variables.has('--x')).toBe(false)

    const splitRoot = postcss.parse([
      '.bg-linear{--tw-gradient-position:to right}',
      '.bg-linear{--tw-gradient-position:to bottom}',
      '.bg-gradient-to-r{background-image:linear-gradient(var(--tw-gradient-stops))}',
      '.bg-gradient-to-r{color:red}',
    ].join('\n'))
    mergeTailwindcssV4GradientDirectionRules(splitRoot)
    expect(splitRoot.toString()).toContain('--tw-gradient-position:to bottom')

    const gradientRoot = postcss.parse([
      '.bg-linear{--tw-gradient-position:to right;background-image:linear-gradient(red, blue)}',
      '.from-red{--tw-gradient-from:red}',
      '.to-blue{--tw-gradient-to:blue}',
    ].join('\n'))
    appendTailwindcssV4MiniProgramGradientRules(gradientRoot)
    expect(gradientRoot.toString()).toContain('.bg-linear.from-red.to-blue')
  })

  it('reports uvue compatibility for sparse and malformed selector rules', () => {
    const malformedRoot = postcss.root()
    malformedRoot.append(postcss.rule({
      selector: '.[',
      nodes: [postcss.decl({ prop: 'display', value: 'block' })],
    }))
    const malformedResult = malformedRoot.toResult({ from: '/src/App.uvue' })
    const malformedFiltered = applyUniAppXUvueCompatibility(malformedResult, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
    })
    expect(malformedFiltered.warnings().map(item => item.text).join('\n')).toContain('selector must be class-only')

    const messages: Array<{ text: string, type: string }> = []
    const sparseRule = {
      selector: '',
      selectors: undefined,
      nodes: [],
      source: undefined,
      walkDecls() {},
      remove() {
        this.removed = true
      },
      warn(_result: Result, text: string) {
        messages.push({ type: 'warning', text })
      },
    } as unknown as Rule & { removed?: boolean }
    const sparseRoot = {
      walkRules(callback: (rule: Rule) => void) {
        callback(sparseRule)
      },
      walkAtRules(callback: (atRule: AtRule & { removed?: boolean }) => void) {
        callback({
          nodes: undefined,
          remove() {
            this.removed = true
          },
        } as AtRule & { removed?: boolean })
      },
      toResult(opts: Result['opts']) {
        return {
          opts,
          messages: [],
          root: this,
          css: '',
          warnings() {
            return this.messages
          },
        } as unknown as Result
      },
    } as unknown as Root

    const sparseFiltered = applyUniAppXUvueCompatibility({
      opts: { from: '/fallback.uvue' },
      root: sparseRoot,
      messages,
    } as unknown as Result, {
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
    })
    expect(sparseRule.removed).toBe(true)
    expect(sparseFiltered.messages.map(item => item.text).join('\n')).toContain('/fallback.uvue')
  })

  it('covers selector transformer cache states for removed and normalized rules', () => {
    const options = {
      cssRemoveHoverPseudoClass: true,
      cssChildCombinatorReplaceValue: ['view', 'text'],
    }

    const removed = postcss.parse('.btn:hover{color:red}').first as Rule
    ruleTransformSync(removed, options)
    expect(removed.parent).toBeUndefined()

    const cachedRemoved = postcss.parse('.btn:hover{color:red}').first as Rule
    ruleTransformSync(cachedRemoved, options)
    expect(cachedRemoved.parent).toBeUndefined()

    const spacing = postcss.parse('.space-y-2 > :not([hidden]) ~ :not([hidden]){margin-top:1px}').first as Rule
    ruleTransformSync(spacing, options)
    expect(spacing.toString()).toContain('view')
  })
})
