import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'
import postcss from 'postcss'
import valueParser from 'postcss-value-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeV4VariableFallbacks, normalizeV4VariableFallbacksLegacy } from '@/compat/tailwindcss-v4/declarations/variable-fallbacks'
import { normalizeUniAppXTransformValue, normalizeUniAppXTransformValues } from '@/compat/uni-app-x-uvue/transform-value'
import { loadNativeCssBinding } from '@/native/binding'

afterEach(() => vi.unstubAllEnvs())

function legacyTranslate(value: string) {
  vi.stubEnv('WEAPP_TW_NATIVE', 'off')
  return normalizeUniAppXTransformValue(value)
}

describe('Rust CSS 值兼容转换', () => {
  it.each([
    'var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))',
    'linear-gradient(var(--tw-gradient-via-stops, red, blue))',
    'var(--tw-x,  ) var(--tw-gradient-from-position) var(--tw-gradient-to-position,\n)',
    'var(--tw-x,/*a*/) var(/*b*/--tw-gradient-from-position) var(--tw-gradient-via-position,/*c*/)',
    'url(var(--tw-x,)) "var(--tw-x,)" /* var(--tw-x,) */',
    'VAR(--tw-gradient-from-position) var(--tw-x,)',
    'var(--tw-gradient-via-stops , /*a*/var(--tw-x,), /*b*/var(--tw-gradient-from-position))',
    '(var(--tw-x,)) calc(var(--tw-x,)/2*3) CALC(var(--tw-gradient-from-position)/2)',
    '😀\uD800 var(--tw-x, ) url("data:var(--tw-x,)")',
  ])('三个 v4 阶段与原实现完全相同：%s', (value) => {
    const expected = normalizeV4VariableFallbacksLegacy(value)
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(loadNativeCssBinding()!.normalizeV4VariableFallbacks(value)).toBe(expected)
    expect(normalizeV4VariableFallbacks(value)).toBe(expected)
  })

  it.each(['var(--tw-x,', 'var(--tw-x, "unterminated', 'var(--tw-x, /*unterminated', `${'f('.repeat(257)}var(--tw-x,)${')'.repeat(257)}`])('不完整或超深值只返回 null，并完整回退：%s', (value) => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(loadNativeCssBinding()!.normalizeV4VariableFallbacks(value)).toBeNull()
    expect(normalizeV4VariableFallbacks(value)).toBe(normalizeV4VariableFallbacksLegacy(value))
  })

  it.each([
    'translate(var(--x, 0), var(--y, 0)) rotate(45deg)',
    'TRANSLATE(1px ,\n2px) translate(translate(1px,2px), 3px)',
    'translate(/*a*/1px/*b*/,/*c*/2px) url(translate(1px,2px))',
    '"translate(1px,2px)" translate("a,b", var(--x, red, blue))',
    'translate(😀\uD800, \uDC00) translate(1px, 2px',
  ])('uvue translate 保留嵌套和字面值逗号：%s', (value) => {
    const expected = legacyTranslate(value)
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(normalizeUniAppXTransformValue(value)).toBe(expected)
  })

  it('完整嵌套值语法矩阵对拍，包含字符串、注释、calc/url 和任意 UTF-16', () => {
    const text = fc.array(fc.integer({ min: 0, max: 65535 }), { maxLength: 12 })
      .map(units => `"${String.fromCharCode(...units).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`)
    const literal = fc.oneof(text, fc.constantFrom('red', '1px', '/*comment*/', 'url(a\\)b)', 'U+00FF', String.raw`a\(b`))
    let value = fc.oneof(literal, fc.constantFrom('var(--tw-x,)', 'var(--tw-gradient-from-position)', 'var(--tw-gradient-via-position,)', 'var(--tw-gradient-via-stops, red, blue)'))
    for (let depth = 0; depth < 3; depth++) {
      const child = value
      value = fc.oneof(child, fc.tuple(fc.constantFrom('calc', 'translate', 'var', 'VAR', 'linear-gradient', ''), fc.array(child, { minLength: 1, maxLength: 4 }), fc.constantFrom(',', ', ', ' ,\n', ' ', ' / '))
        .map(([name, args, delimiter]) => `${name}(${args.join(delimiter)})`))
    }
    fc.assert(fc.property(value, (input) => {
      const expected = normalizeV4VariableFallbacksLegacy(input)
      const expectedTranslate = legacyTranslate(input)
      vi.stubEnv('WEAPP_TW_NATIVE', 'required')
      const native = loadNativeCssBinding()!.normalizeV4VariableFallbacks(input)
      expect(native).toBe(expected)
      expect(normalizeUniAppXTransformValue(input)).toBe(expectedTranslate)
    }), { seed: 20261004, numRuns: 3000 })
  })

  it('全部现有 CSS fixture 声明逐值对拍', () => {
    const directory = fileURLToPath(new URL('../fixtures/css', import.meta.url))
    let count = 0
    let changed = 0
    for (const file of readdirSync(directory, { recursive: true })) {
      if (typeof file !== 'string' || !file.endsWith('.css')) {
        continue
      }
      const root = postcss.parse(readFileSync(path.join(directory, file), 'utf8'))
      root.walkDecls((decl) => {
        const expected = normalizeV4VariableFallbacksLegacy(decl.value)
        const expectedTranslate = legacyTranslate(decl.value)
        vi.stubEnv('WEAPP_TW_NATIVE', 'required')
        const native = loadNativeCssBinding()!.normalizeV4VariableFallbacks(decl.value)
        expect(native, `${file}: ${decl.value}`).toBe(expected)
        expect(normalizeUniAppXTransformValue(decl.value)).toBe(expectedTranslate)
        changed += Number(expected !== decl.value)
        count++
      })
    }
    expect(count).toBeGreaterThan(8000)
    expect(changed).toBeGreaterThan(0)
  })

  it('串行变换不改变未匹配节点的序列化', () => {
    const source = 'var(--tw-gradient-via-stops, url(data:a,b), rgb(1, 2, 3)), var(--tw-gradient-to-position)'
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const native = loadNativeCssBinding()!.normalizeV4VariableFallbacks(source)!
    expect(valueParser(native).toString()).toBe(normalizeV4VariableFallbacksLegacy(source))
  })

  it('生产 uvue 批次保持声明顺序、空值和不完整值回退', () => {
    const values = ['rotate(45deg)', '', 'translate(1px,2px)', 'translate(var(--x,0), var(--y,0))', 'translate(1px,2px']
    const expected = values.map(legacyTranslate)
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(normalizeUniAppXTransformValues(values)).toEqual(expected)
    expect(normalizeUniAppXTransformValues([])).toEqual([])
  })
})
