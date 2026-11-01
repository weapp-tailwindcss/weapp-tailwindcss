import valueParser from 'postcss-value-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeV4VariableFallbacksLegacy } from '../src/compat/tailwindcss-v4/declarations/variable-fallbacks'

vi.mock('postcss-value-parser', async (importOriginal) => {
  const original = await importOriginal<typeof import('postcss-value-parser')>()
  return { ...original, default: Object.assign(vi.fn(original.default), original.default) }
})

afterEach(() => vi.clearAllMocks())

function transformedVar() {
  const result = vi.mocked(valueParser).mock.results[1]
  if (!result || result.type !== 'return') {
    throw new Error('Expected the real parser result from the normalization stage')
  }
  let found: valueParser.FunctionNode | undefined
  result.value.walk((node) => {
    if (!found && node.type === 'function' && node.value === 'var') {
      found = node
    }
  })
  if (!found) {
    throw new Error('Expected the transformed var node')
  }
  return found
}

describe('变量 fallback 节点的原文来源', () => {
  it('via-stops 拆分保留函数、参数和首逗号的原文区间', () => {
    const input = 'linear-gradient(var(--tw-gradient-via-stops  , /*a*/red, /*b*/blue))'
    expect(normalizeV4VariableFallbacksLegacy(input)).toBe('linear-gradient(var(--tw-gradient-via-stops, /*a*/red), /*b*/blue)')
    const node = transformedVar()
    expect([node.sourceIndex, node.sourceEndIndex]).toEqual([16, 67])
    expect(node.nodes[0]).toEqual({ type: 'word', value: '--tw-gradient-via-stops', sourceIndex: 20, sourceEndIndex: 43 })
    expect(node.nodes[1]).toEqual({ type: 'div', value: ',', before: '', after: ' ', sourceIndex: 43, sourceEndIndex: 47 })
  })

  it.each([
    { input: 'var(--tw-gradient-from-position   )', expected: 'var(--tw-gradient-from-position, )', anchor: 31 },
    { input: 'var(--tw-gradient-from-position   ', expected: 'var(--tw-gradient-from-position   , ', anchor: 34 },
    { input: '😀 var(--tw-gradient-from-position)', expected: '😀 var(--tw-gradient-from-position, )', anchor: 34 },
    { input: 'calc(var(--tw-gradient-from-position) + 1px)', expected: 'calc(var(--tw-gradient-from-position, ) + 1px)', anchor: 36 },
    { input: 'var(--tw-gradient-from-position "', expected: 'var(--tw-gradient-from-position ", ', anchor: 33 },
    { input: 'var(--tw-gradient-from-position url(a', expected: 'var(--tw-gradient-from-position url(a, ', anchor: 37 },
  ])('新逗号在原文真实边界使用零宽锚点：$input', ({ input, expected, anchor }) => {
    expect(normalizeV4VariableFallbacksLegacy(input)).toBe(expected)
    const comma = transformedVar().nodes.find(node => node.type === 'div' && node.value === ',')
    expect(comma).toMatchObject({ sourceIndex: anchor, sourceEndIndex: anchor })
    expect(anchor).toBeLessThanOrEqual(input.length)
  })

  it.each([
    { input: 'var(--tw-gradient-from-position,)', expected: 'var(--tw-gradient-from-position, )' },
    { input: 'var(--tw-gradient-from-position, /*keep*/)', expected: 'var(--tw-gradient-from-position, /*keep*/)' },
    { input: 'var(--tw-gradient-from-position, 2px)', expected: 'var(--tw-gradient-from-position, 2px)' },
  ])('保留已有空逗号和显式 fallback 的语义：$input', ({ input, expected }) => {
    expect(normalizeV4VariableFallbacksLegacy(input)).toBe(expected)
    expect(normalizeV4VariableFallbacksLegacy(expected)).toBe(expected)
  })
})
