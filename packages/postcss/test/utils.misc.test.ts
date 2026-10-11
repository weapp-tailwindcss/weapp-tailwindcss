import { Declaration, Rule } from 'postcss'
import { describe, expect, it } from 'vitest'
import { fingerprintOptions } from '@/fingerprint'
import { createCssVarNodes } from '@/utils/css-vars'
import { hasTwVars } from '@/utils/tw-vars'

describe('fingerprintOptions', () => {
  it('covers primitives, functions and symbols', () => {
    const fn = function namedFn() {}
    const anon = () => {}
    const sym = Symbol('demo')

    expect(fingerprintOptions(null)).toBe('null')
    expect(fingerprintOptions(undefined)).toBe('undefined')
    expect(fingerprintOptions(1)).not.toBe(fingerprintOptions('1'))
    expect(fingerprintOptions(fn)).toBe(fingerprintOptions(fn))
    expect(fingerprintOptions(anon)).not.toBe(fingerprintOptions(fn))
    expect(fingerprintOptions(sym)).toBe(`sym:${String(sym)}`)
  })

  it('caches object references across calls', () => {
    const state = { map: new WeakMap<object, string>(), counter: 0 }
    const target = {}

    const first = fingerprintOptions(target, state)
    expect(first).toBe('{}@ref:0')

    const second = fingerprintOptions(target, state)
    expect(second).toBe('ref:0')

    const arrayFingerprint = fingerprintOptions([target, { nested: target }], state)
    expect(arrayFingerprint).toContain('[ref:0')
    expect(arrayFingerprint).toContain('{"nested":ref:0}')
  })

  it('fingerprints map contents deterministically', () => {
    const first = fingerprintOptions(new Map([
      ['--text-xs', '0.75rem'],
      ['--color-white', '#fff'],
    ]))
    const reordered = fingerprintOptions(new Map([
      ['--color-white', '#fff'],
      ['--text-xs', '0.75rem'],
    ]))
    const changed = fingerprintOptions(new Map([
      ['--color-white', '#000'],
      ['--text-xs', '0.75rem'],
    ]))

    expect(first).toBe(reordered)
    expect(first).not.toBe(changed)
  })
})

describe('css var helpers', () => {
  it('creates declaration nodes', () => {
    const nodes = createCssVarNodes([{ prop: '--tw-foo', value: '1' }])
    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toBeInstanceOf(Declaration)
    expect(nodes[0].prop).toBe('--tw-foo')
    expect(nodes[0].value).toBe('1')
  })
})

describe('hasTwVars', () => {
  it('detects required count of tw vars', () => {
    const rule = new Rule({ selector: '.foo' })
    rule.append(new Declaration({ prop: '--tw-one', value: '1' }))
    expect(hasTwVars(rule, 2)).toBe(false)

    rule.append(new Declaration({ prop: '--tw-two', value: '2' }))
    expect(hasTwVars(rule, 2)).toBe(true)
  })
})
