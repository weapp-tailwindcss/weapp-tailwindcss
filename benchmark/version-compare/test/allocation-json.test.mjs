import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { limits } from '../scripts/diagnostics/constants.mjs'
import { compressAllocationEnvelope } from '../scripts/diagnostics/profile-compression.mjs'
import { boundedJsonBytes } from '../scripts/diagnostics/profile-json.mjs'

const size = (value, maximum = limits.maxTotalBytes) => boundedJsonBytes(value, { filename: 'allocation.json', maximum })
const holes = []
holes.length = 3

describe('序列化前的 JSON 实际字节上限', () => {
  it.each([
    null,
    true,
    12.125,
    Number.POSITIVE_INFINITY,
    '\u0000\b\t\n\f\r"\\中文😀\uD800\uDC00\uDC00\uD800',
    [undefined, null, Number.NaN, false, '\u2028\u2029'],
    Array.from({ length: 3 }),
    holes,
    { 'a': undefined, 'b': { c: 1e30 }, 'd': [1, 2], '中文😀': '内容' },
    Object.assign(Object.create(null), { value: '保留字段' }),
  ].map(value => [value]))('精确匹配 JSON.stringify 的 UTF-8 字节：%j', (value) => {
    const actual = Buffer.byteLength(JSON.stringify(value))
    expect(size(value)).toBe(actual)
    expect(size(value, actual)).toBe(actual)
    expect(() => size(value, actual - 1)).toThrow('固定上限')
  })

  it('允许重复对象引用，拒绝循环与自定义序列化而不执行用户代码', () => {
    const value = { string: '保持 JSON 字段' }
    expect(size([value, value])).toBe(Buffer.byteLength(JSON.stringify([value, value])))
    const cycle = { value }
    cycle.self = cycle
    expect(() => size(cycle)).toThrow('普通 JSON 数据')
    const toJSON = vi.fn(() => '不应执行')
    expect(() => size({ toJSON })).toThrow('普通 JSON 数据')
    expect(toJSON).not.toHaveBeenCalled()
    expect(() => size(1n)).toThrow('普通 JSON 数据')
  })

  it('超过 64 MiB 的扩展字段在分配完整 JSON 字符串前失败', () => {
    const document = { unknown: 'x'.repeat(limits.maxTotalBytes + 1) }
    const stringify = vi.spyOn(JSON, 'stringify')
    try {
      expect(() => compressAllocationEnvelope(document, { filename: 'allocation.json' })).toThrow('compression-input')
      // 错误本身只序列化固定大小的尺寸与预算；原始文档从未交给 stringify。
      expect(stringify.mock.calls.every(([value]) => value !== document)).toBe(true)
    }
    finally {
      stringify.mockRestore()
    }
  })
})
