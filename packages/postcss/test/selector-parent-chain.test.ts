import postcss from 'postcss'
import selectorParser from 'postcss-selector-parser'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createStyleHandler } from '../src/handler'
import { ruleTransformSync } from '../src/selectorParser/rule-transformer'
import { removeUnsupportedPseudoSelector } from '../src/selectorParser/rule-transformer/unsupported-pseudos'

beforeEach(() => vi.stubEnv('WEAPP_TW_NATIVE', 'off'))
afterEach(() => vi.unstubAllEnvs())

describe('selector parent ownership', () => {
  it('removes only the root branch containing a nested unsupported pseudo', () => {
    const root = selectorParser().astSync('.safe,:is(.branch,:where(.nested:hover))')
    root.walkPseudos((pseudo) => {
      if (pseudo.value === ':hover') {
        expect(removeUnsupportedPseudoSelector(pseudo, { cssRemoveHoverPseudoClass: true })).toBe(true)
      }
    })
    expect(root.toString()).toBe('.safe')
  })

  it('handles a detached pseudo without traversing an unrelated root', () => {
    const detached = selectorParser.pseudo({ value: ':hover' })
    const unrelated = selectorParser().astSync('.safe')
    expect(removeUnsupportedPseudoSelector(detached, { cssRemoveHoverPseudoClass: true })).toBe(true)
    expect(detached.parent).toBeUndefined()
    expect(unrelated.toString()).toBe('.safe')
  })

  it.each([
    { selector: '.safe,.branch:not(:-moz-any(:lang(ar)))', expected: '.safe,.branch' },
    { selector: '.safe,:where(:is(.branch:-moz-any(:lang(ar))))', expected: '.safe' },
    { selector: '.safe,:where(:is(.branch:checked))', expected: '.safe' },
    { selector: '.safe,.branch:not(:-moz-any(:lang(ar)),:checked)', expected: '.safe,.branch' },
    { selector: '.safe,.branch>:not(:last-child:checked)', expected: '.safe' },
  ])('preserves sibling ownership for $selector', ({ selector, expected }) => {
    const rule = postcss.rule({ selector })
    ruleTransformSync(rule, {})
    expect(rule.selector).toBe(expected)
  })

  it.each([
    { selector: '.safe,.branch:where(.before:before,.keep)', expected: '.safe' },
    { selector: '.safe,.branch:where(:is(.before:before,.keep))', expected: '.safe' },
    { selector: '.safe,.branch:not(:where(.b,.c))', expected: '.safe,.branch' },
  ])('preserves original uni-app x multi-branch rejection for $selector', ({ selector, expected }) => {
    const root = postcss.parse(`${selector}{color:red}`)
    const rule = root.first as postcss.Rule
    ruleTransformSync(rule, { uniAppX: true })
    expect(rule.selector).toBe(expected)
  })

  it('retains raw classes and original sibling where expansion order', () => {
    const raw = postcss.rule({ selector: String.raw`:where(.child\:ring-white)>:where(:not(.not-child))` })
    ruleTransformSync(raw, {})
    expect(raw.selector).toBe(String.raw`.child\:ring-white>:not(.not-child)`)
    const siblings = postcss.rule({ selector: '.a:where(.b,.c):where(.d,.e)' })
    ruleTransformSync(siblings, {})
    expect(siblings.selector).toBe('.a.b:where(.d,.e),.a.c:where(.d,.e)')
  })

  it('cleans nested RTL branches in the complete PostCSS lifecycle', async () => {
    const result = await createStyleHandler()('.safe,:where(:is(.branch:-moz-any(:lang(ar)))){color:red}')
    const selectors: string[] = []
    result.root.walkRules((rule) => {
      selectors.push(rule.selector)
    })
    expect(selectors).toEqual(['.safe'])
  })
})
