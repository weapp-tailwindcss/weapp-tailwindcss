import type { EscapeOptions } from '../src'
import * as published from 'escape-published'
import { describe, expect, it } from 'vitest'
import * as current from '../src'

const samples = [
  '', 'flex', 'hover:bg-red-500', 'w-[calc(100%-1rem)]', '1xl:text-sm', '-', '-1',
  'a_b _b _c u_x41_', '中文😀', '\ud800', '\udfff', 'a\u0000\n\r\t b',
  String.fromCharCode(...Array.from({ length: 128 }, (_, i) => i)),
]
const options: Array<EscapeOptions | undefined> = [
  undefined,
  { ignoreHead: true },
  { map: current.ComplexMappingChars2String },
  { map: { ':': '_colon_', '/': '_slash_', '[': '_open_' } },
]

describe('npm 8.0.0 迁移兼容性', () => {
  it('保留所有公开导出及映射数据', () => {
    expect(Object.keys(current).sort()).toEqual(Object.keys(published).sort())
    for (const key of Object.keys(current) as Array<keyof typeof current>) {
      if (typeof current[key] !== 'function') {
        expect(current[key]).toEqual(published[key])
      }
    }
  })

  it.each(options)('保持默认及自定义配置的双向转换：%j', (option) => {
    for (const input of samples) {
      const actual = current.escape(input, option)
      expect(actual).toBe(published.escape(input, option))
      expect(current.unescape(actual, option)).toBe(published.unescape(actual, option))
      expect(current.unescape(input, option)).toBe(published.unescape(input, option))
      expect(current.isAllowedClassName(input)).toBe(published.isAllowedClassName(input))
    }
  })

  it('覆盖 BMP、补充平面、孤立代理项及无效转义标记', () => {
    for (const point of [0, 32, 127, 128, 0x4E2D, 0xD800, 0xDFFF, 0xFFFF, 0x10000, 0x1F600, 0x10FFFF]) {
      const input = String.fromCodePoint(point)
      expect(current.escape(input)).toBe(published.escape(input))
      expect(current.unescape(current.escape(input))).toBe(published.unescape(published.escape(input)))
    }
    for (const input of ['u_x_', 'u_xzz_', 'u_x110000_', '_', '_c', '_unknown_']) {
      expect(current.unescape(input)).toBe(published.unescape(input))
    }
  })
})
