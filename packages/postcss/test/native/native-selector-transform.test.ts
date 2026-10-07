import type { IStyleHandlerOptions } from '@/types'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'
import postcss from 'postcss'
import psp from 'postcss-selector-parser'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadNativeSelectorBinding, transformNativeSelector } from '@/selectorParser/native'
import { ruleTransformSync } from '@/selectorParser/rule-transformer'

afterEach(() => vi.unstubAllEnvs())

function transform(selector: string, mode: string, options: Partial<IStyleHandlerOptions> = {}) {
  vi.stubEnv('WEAPP_TW_NATIVE', mode)
  const root = postcss.root({ nodes: [postcss.rule({ selector, nodes: [] })] })
  root.walkRules(rule => ruleTransformSync(rule, { ...options }))
  return root.first?.type === 'rule' ? root.first.selector : undefined
}

describe('Rust 直接选择器转换', () => {
  it.each([
    String.raw`.w-\[10px\]`,
    String.raw`  .\32 xl\:w-1\/2 > .h-\[2px\] , #root & `,
    String.raw`.a\,b+.\1f600 .--double`,
    String.raw`.\0 .\d800 .\110000`,
    '.中文\uD800.😀',
    String.raw`.content-\[\'hello\'\]#root~.m-\[-1px\]`,
  ])('默认映射直接在 Rust 完成：%s', (selector) => {
    const expected = transform(selector, 'off')
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(transformNativeSelector(selector)).toBe(expected)
    expect(transform(selector, 'required')).toBe(expected)
  })

  it.each([
    '.a:hover',
    '.a[hidden]',
    'view.a',
    '.a/*comment*/.b',
    '.a,',
    String.raw`.a\20 b`,
    String.raw`.\000032 xl`,
    '.space-x-2 > :not(:last-child)',
    '.a:where(.b,.c)',
    '#é.a',
    String.raw`#a\:b.a`,
  ])('未接管的语法完整回退：%s', (selector) => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(transformNativeSelector(selector)).toBeUndefined()
    expect(transform(selector, 'required')).toBe(transform(selector, 'off'))
  })

  it('自定义映射保留 AST 序列化和平台转换语义', () => {
    const selector = String.raw`.w-\[2px\],.--x`
    for (const options of [
      { escapeMap: { '[': ' ', ']': '\uD800' } },
      { escapeMap: { 'w': '2', '-': '--' } },
      { uniAppX: true, uniAppXCssTarget: 'uvue' },
    ] satisfies Partial<IStyleHandlerOptions>[]) {
      expect(transform(selector, 'required', options)).toBe(transform(selector, 'off', options))
    }
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(transformNativeSelector(selector, { escapeMap: { '[': 'OPEN' } })).toBeUndefined()
    expect(transformNativeSelector(selector, { escapeMap: {} })).toBe(transform(selector, 'off'))
  })

  it('随机 UTF-16 类名、CSS escape 与组合器逐字节对拍', () => {
    const classes = fc.array(fc.integer({ min: 0, max: 65535 }), { minLength: 1, maxLength: 30 })
      .map((units) => {
        const node = psp.className({ value: '' })
        node.value = String.fromCharCode(...units)
        return node.toString()
      })
    let handled = 0
    fc.assert(fc.property(
      fc.array(classes, { minLength: 1, maxLength: 8 }),
      fc.constantFrom('', ' ', ' > ', '+', ' ~ ', ', ', '#id '),
      (values, separator) => {
        const selector = values.join(separator)
        const expected = transform(selector, 'off')
        vi.stubEnv('WEAPP_TW_NATIVE', 'required')
        const native = transformNativeSelector(selector)
        if (native !== undefined) {
          handled++
          expect(native).toBe(expected)
        }
        expect(transform(selector, 'required')).toBe(expected)
      },
    ), { seed: 20261004, numRuns: 1000 })
    expect(handled).toBeGreaterThan(500)
  })

  it('真实 CSS fixtures 的选择器批次保持原有转换结果', () => {
    const fixtureRoot = fileURLToPath(new URL('../fixtures/css', import.meta.url))
    const selectors: string[] = []
    for (const file of readdirSync(fixtureRoot, { recursive: true })) {
      if (typeof file !== 'string' || !file.endsWith('.css')) {
        continue
      }
      const root = postcss.parse(readFileSync(path.join(fixtureRoot, file), 'utf8'))
      root.walkRules(rule => selectors.push(rule.selector))
    }
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    const result = loadNativeSelectorBinding()!.transformSelectors(selectors)
    expect(result).toHaveLength(selectors.length)
    let handled = 0
    result.forEach((native, index) => {
      if (native === null || native === undefined) {
        return
      }
      handled++
      expect(native, selectors[index]).toBe(transform(selectors[index]!, 'off'))
    })
    expect(selectors.length).toBeGreaterThan(100)
    expect(handled).toBeGreaterThan(50)
  })
})
