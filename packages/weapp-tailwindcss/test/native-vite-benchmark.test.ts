import type { NativeReport } from '../benchmark/oxc-vite/types'
import { describe, expect, it } from 'vitest'
import { createNativeCounter, measuredNativeCalls } from '../benchmark/oxc-vite/native'
import { comparisonModes, nativeMode, pairOrder, parseOptions } from '../benchmark/oxc-vite/options'

describe('Vite comparison modes', () => {
  it('keeps transfer as the default and explicitly disables native for both old modes', () => {
    expect(parseOptions([]).compare).toBe('transfer')
    expect(comparisonModes('transfer')).toEqual(['normal', 'raw'])
    expect(nativeMode({ compare: 'transfer', mode: 'normal' })).toBe('off')
    expect(nativeMode({ compare: 'transfer', mode: 'raw' })).toBe('off')
    expect(() => nativeMode({ compare: 'transfer', mode: 'required' })).toThrow()
  })

  it('alternates native off/required independently from the raw-transfer comparison', () => {
    expect(parseOptions(['--compare', 'native', '--target', 'weapp']).compare).toBe('native')
    expect(pairOrder(0, 'native')).toEqual(['off', 'required'])
    expect(pairOrder(1, 'native')).toEqual(['required', 'off'])
    expect(pairOrder(1)).toEqual(['raw', 'normal'])
    expect(nativeMode({ compare: 'native', mode: 'required' })).toBe('required')
    expect(() => parseOptions(['--compare', 'rust'])).toThrow()
    expect(() => nativeMode({ compare: 'native', mode: 'raw' })).toThrow()
  })
})

describe('native benchmark counters', () => {
  it('counts methods on reusable factory instances without changing this, results or cleanup', () => {
    const report: NativeReport = { bindings: [], counts: {} }
    const counter = createNativeCounter(report)
    class Transformer {
      prefix = 'result:'
      transform(source: string) { return `${this.prefix}${source}` }
      transformWithCandidates(source: string, contains: (candidate: string) => boolean) { return contains(source) ? `${this.prefix}${source}` : null }
      replaceClassNames(_classes: string[]) { return true }
    }
    const transformer = new Transformer()
    const original = transformer.transform
    const candidates = transformer.transformWithCandidates
    const binding = { createJsTransformer: () => transformer, analyzeJs: (_source: string) => null }
    const factory = binding.createJsTransformer
    counter.binding(binding)
    try {
      counter.phase('self-check')
      expect(binding.analyzeJs('probe')).toBeNull()
      counter.phase('build')
      expect(binding.createJsTransformer()).toBe(transformer)
      expect(binding.createJsTransformer()).toBe(transformer)
      expect(transformer.transform('😀')).toBe('result:😀')
      expect(transformer.transformWithCandidates('😀', candidate => candidate === '😀')).toBe('result:😀')
      counter.phase('add')
      expect(transformer.replaceClassNames(['w-[1px]'])).toBe(true)
      expect(transformer.transform('text')).toBe('result:text')
      expect(transformer.transformWithCandidates('text', () => false)).toBeNull()
      const failure = new Error('candidate callback failure')
      expect(() => transformer.transformWithCandidates('fail', () => {
        throw failure
      })).toThrow(failure)
      expect(report.counts.build?.createJsTransformer?.calls).toBe(2)
      expect(report.counts.build?.transform).toEqual({ calls: 1, failures: 0, nullReturns: 0, sourceCodeUnits: 2 })
      expect(report.counts.add?.transform?.calls).toBe(1)
      expect(report.counts.add?.replaceClassNames?.calls).toBe(1)
      expect(report.counts.build?.transformWithCandidates).toEqual({ calls: 1, failures: 0, nullReturns: 0, sourceCodeUnits: 2 })
      expect(report.counts.add?.transformWithCandidates).toEqual({ calls: 2, failures: 1, nullReturns: 1, sourceCodeUnits: 8 })
      expect(measuredNativeCalls(report)).toBe(8)
    }
    finally {
      counter.restore()
    }
    expect(binding.createJsTransformer).toBe(factory)
    expect(transformer.transform).toBe(original)
    expect(transformer.transformWithCandidates).toBe(candidates)
    expect(Object.hasOwn(transformer, 'transform')).toBe(false)
    expect(Object.hasOwn(transformer, 'transformWithCandidates')).toBe(false)
  })

  it('records native exceptions while preserving their identity and unsupported null results', () => {
    const failure = new Error('native execution failed')
    const report: NativeReport = { bindings: [], counts: {} }
    const binding = {
      tokenizeWxml: (_source: string) => { throw failure },
      transformSelector: (_source: string) => null,
    }
    const counter = createNativeCounter(report)
    counter.binding(binding)
    counter.phase('text')
    try {
      expect(() => binding.tokenizeWxml('text')).toThrow(failure)
      expect(binding.transformSelector(':is(*)')).toBeNull()
      expect(report.counts.text?.tokenizeWxml).toEqual({ calls: 1, failures: 1, nullReturns: 0, sourceCodeUnits: 4 })
      expect(report.counts.text?.transformSelector?.failures).toBe(0)
      expect(report.counts.text?.transformSelector?.nullReturns).toBe(1)
    }
    finally {
      counter.restore()
    }
  })
})
