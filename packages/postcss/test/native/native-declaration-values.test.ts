import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeTailwindcssV4Declaration } from '@/compat/tailwindcss-v4/declarations'
import { normalizeTailwindcssV4GradientPosition, normalizeTailwindcssV4GradientPositionLegacy, normalizeTailwindcssV4InfinityCalcCss, normalizeTailwindcssV4InfinityCalcCssLegacy, normalizeTailwindcssV4InfinityCalcValue, normalizeTailwindcssV4InfinityCalcValueLegacy } from '@/compat/tailwindcss-v4/gradients'
import { loadNativeCssBinding } from '@/native/binding'
import { createStyleHandler } from '@/transform'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('Rust v4 声明值生产消费', () => {
  function declaration(value: string, prop = 'border-radius') {
    const run = (mode: string) => {
      vi.stubEnv('WEAPP_TW_NATIVE', mode)
      const decl = postcss.decl({ prop, value })
      return { changed: normalizeTailwindcssV4Declaration(decl), value: decl.value }
    }
    const expected = run('off')
    expect(run('required'), value).toEqual(expected)
  }

  it.each([
    '100000px 100000.00000000001px 100000.000000000001px',
    '-100001px a-100001px +100001px a+100001px .100001px',
    '1e-100px -1E+200RPX 1.e3px 1e309px',
    'a100001px 100001pxa _100001px 100001px_ é100001px',
    '"100001px" url(100001px) /*100001px*/ 😀\uD800 100001px\uDC00',
    'calc(infinity * 0px)',
    'calc(infinity * 2.PX)',
    'CALC(INFINITY * .5RPX)',
    'var(--tw-x,)',
    'var(--tw-gradient-via-stops, red, blue)',
    'var(--tw-x, "unfinished',
    `${'f('.repeat(257)}1e99px${')'.repeat(257)}`,
  ])('严格保持正则与 Number 边界：%s', value => declaration(value))

  it('原生完整声明将三个变量阶段与新增值计算合并为一次调用', () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const binding = loadNativeCssBinding()!
    const combined = vi.spyOn(binding, 'normalizeV4Declaration')
    const variable = vi.spyOn(binding, 'normalizeV4VariableFallbacks')
    const decl = postcss.decl({ prop: 'border-radius', value: 'var(--tw-x,) 1e9px' })
    expect(normalizeTailwindcssV4Declaration(decl)).toBe(true)
    expect(decl.value).toBe('var(--tw-x, ) 9999px')
    expect(combined).toHaveBeenCalledOnce()
    expect(combined).toHaveReturnedWith('var(--tw-x, ) 9999px')
    expect(variable).not.toHaveBeenCalled()
  })

  it('渐变方向保持父规则首个背景声明、顺序、删除与提前返回', () => {
    const css = '.a{--tw-gradient-position:in oklab;background-image:radial-gradient(red,blue);background-image:conic-gradient(red,blue)}.b{background-image:conic-gradient(red,blue);--tw-gradient-position:in oklab}.c{--tw-gradient-position:calc(-45deg * -1) in oklch longer hue;--tw-gradient-via-stops:initial;--tw-gradient-position:calc(infinity * 1px) in srgb}@supports(a:b){--tw-gradient-position:in oklab} '
    const run = (mode: string) => {
      vi.stubEnv('WEAPP_TW_NATIVE', mode)
      const root = postcss.parse(css)
      const changes: boolean[] = []
      root.walkDecls((decl) => {
        changes.push(normalizeTailwindcssV4Declaration(decl))
      })
      return { css: root.toString(), changes }
    }
    const expected = run('off')
    expect(run('required')).toEqual(expected)
    expect(expected.css).toContain('--tw-gradient-position:at center')
    expect(expected.css).toContain('--tw-gradient-position:from 0deg')
    expect(expected.css).toContain('--tw-gradient-position:--45deg')
    expect(expected.css).toContain('--tw-gradient-position:calc(infinity * 1px)')
  })

  it('UTF-16、JS 空白、角度与数值语法矩阵直接对拍', () => {
    const fragments = fc.constantFrom('calc(', ')', 'infinity', '*', '-1', '100001', '100000.000000000001', '1e-9', '.5', '2.', 'px', 'rpx', 'DEG', 'grad', 'rad', 'turn', 'in', 'oklab', 'oklch', 'srgb', 'hsl', 'longer', 'shorter', 'increasing', 'decreasing', 'hue', ' ', '\n', '\r', '\t', '\u0085', '\u00A0', '\uFEFF', '\u2028', '😀', '\uD800', '\uDC00', 'a', '_', '+', '-', '"', '/*', '*/')
    const arbitrary = fc.array(fragments, { maxLength: 22 }).map(parts => parts.join(''))
    const gradient = fc.tuple(fc.constantFrom('', 'to right ', 'calc(-45deg * -1) ', 'calc(+.5TURN * -1) '), fc.constantFrom('in oklab', 'in srgb longer hue', 'in hsl', 'in oklch decreasing hue', 'longer'), fc.constantFrom('', '\n', '\r\n', ' ', ' \n', '\u0085', '\uFEFF'))
      .map(parts => parts.join(''))
    fc.assert(fc.property(fc.oneof(arbitrary, gradient), (value) => {
      vi.stubEnv('WEAPP_TW_NATIVE', 'required')
      expect(normalizeTailwindcssV4GradientPosition(value)).toBe(normalizeTailwindcssV4GradientPositionLegacy(value))
      expect(normalizeTailwindcssV4InfinityCalcValue(value)).toBe(normalizeTailwindcssV4InfinityCalcValueLegacy(value))
      expect(normalizeTailwindcssV4InfinityCalcCss(value)).toBe(normalizeTailwindcssV4InfinityCalcCssLegacy(value))
      declaration(value)
    }), { seed: 20261005, numRuns: 6000 })
  })

  it('十进制舍入、指数溢出和 word 边界保持原有圆角输出', () => {
    const digits = fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 1, maxLength: 40 }).map(value => value.join(''))
    const numbers = fc.tuple(fc.constantFrom('', '+', '-'), digits, fc.constantFrom('', '.', '.5', '.000000000001', 'e-999', 'E+999', 'e', 'e+'), fc.constantFrom('', ' ', '\t', '\uFEFF'), fc.constantFrom('px', 'rpx', 'PX', 'RPX'))
      .map(value => value.join(''))
    fc.assert(fc.property(fc.tuple(fc.constantFrom('', 'a', '-', '.', '😀', '\uD800'), numbers, fc.constantFrom('', '_', 'a', '\uDC00')), value => declaration(value.join(''))), { seed: 20261006, numRuns: 3000 })
  })

  it('现有 CSS fixture 全声明以及真实插件输出 required/off 完全一致', async () => {
    const directory = fileURLToPath(new URL('../fixtures/css', import.meta.url))
    let count = 0
    let calls = 0
    let completed = 0
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const binding = loadNativeCssBinding()!
    const original = binding.normalizeV4Declaration
    vi.spyOn(binding, 'normalizeV4Declaration').mockImplementation((...args) => {
      calls++
      const result = original(...args)
      if (result !== null) {
        completed++
      }
      return result
    })
    for (const file of readdirSync(directory, { recursive: true })) {
      if (typeof file !== 'string' || !file.endsWith('.css')) {
        continue
      }
      const source = readFileSync(path.join(directory, file), 'utf8')
      const run = (mode: string) => {
        vi.stubEnv('WEAPP_TW_NATIVE', mode)
        const root = postcss.parse(source)
        const changes: boolean[] = []
        root.walkDecls((decl) => {
          changes.push(normalizeTailwindcssV4Declaration(decl))
        })
        return { css: root.toString(), changes }
      }
      const expected = run('off')
      expect(run('required'), file).toEqual(expected)
      count += expected.changes.length
      if (/^v4[^/\\]*\.css$/.test(file) && !file.includes('.out.')) {
        vi.stubEnv('WEAPP_TW_NATIVE', 'off')
        const legacy = await createStyleHandler({ isMainChunk: true, majorVersion: 4 })(source)
        vi.stubEnv('WEAPP_TW_NATIVE', 'required')
        const native = await createStyleHandler({ isMainChunk: true, majorVersion: 4 })(source)
        expect(native.css, file).toBe(legacy.css)
      }
    }
    expect(count).toBeGreaterThan(8000)
    expect(calls).toBeGreaterThan(count)
    expect(completed).toBeGreaterThan(8000)
  }, 120_000)

  it('原生 null 才回退，执行错误保留原异常', () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const binding = loadNativeCssBinding()!
    expect(binding.normalizeV4Declaration('var(--tw-x, "unfinished', {})).toBeNull()
    const failure = new Error('native declaration failure')
    vi.spyOn(binding, 'normalizeV4Declaration').mockImplementation(() => {
      throw failure
    })
    expect(() => normalizeTailwindcssV4Declaration(postcss.decl({ prop: 'border-radius', value: '1e9px' }))).toThrow(failure)
  })
})
