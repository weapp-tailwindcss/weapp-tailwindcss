import type { IStyleHandlerOptions } from '@/types'
import { escape } from '@weapp-tailwindcss/escape'
import fc from 'fast-check'
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStyleHandler } from '@/handler'
import { escapeNativeSelectorClasses, loadNativeSelectorBinding } from '@/selectorParser/native'
import { ruleTransformSync } from '@/selectorParser/rule-transformer'

afterEach(() => vi.unstubAllEnvs())

describe('Rust 选择器类名计算', () => {
  it('通过 required 模式验证真实二进制的 UTF-16 与映射语义', () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    expect(loadNativeSelectorBinding()).toBeDefined()
    const values = ['', 'plain', '2xl:text-red-500', '-', '-2', '--2', 'w-[10px]', 'before:content-["a"]', '中文😀', '\uD800x\uDC00', '\0\t\n\r\u007F']
    for (const escapeMap of [undefined, {}, { '.': 'DOT', ':': '', '-': 'MINUS', '0': 'ZERO' }, { '.': '\uD800.' }]) {
      expect(escapeNativeSelectorClasses(values, { escapeMap })).toEqual(values.map(value => escape(value, { map: escapeMap })))
    }
  })

  it('任意 UTF-16 输入与 TypeScript escape 逐字节相同', () => {
    vi.stubEnv('WEAPP_TW_NATIVE', 'required')
    fc.assert(fc.property(
      fc.array(fc.array(fc.integer({ min: 0, max: 65535 }), { maxLength: 64 }), { minLength: 1, maxLength: 16 }),
      (units) => {
        const values = units.map(value => String.fromCharCode(...value))
        expect(escapeNativeSelectorClasses(values)).toEqual(values.map(value => escape(value)))
      },
    ), { numRuns: 300, seed: 20261004 })
  })

  it.each([
    String.raw`.w-\[10px\]`,
    String.raw`.\32 xl\:text-red-500,.w-1\/2`,
    String.raw`.parent:where(.w-\[10px\],.h-\[20px\])`,
    String.raw`:where(.a,.b):where(.w-\[10px\],.h-\[20px\])`,
    String.raw`.space-x-2 > :not([hidden]) ~ :not([hidden])`,
    String.raw`[class="w-[10px]"] .w-\[10px\]:hover`,
    String.raw`:is(.中文,.😀) .w-\[10px\]::before`,
    String.raw`.a\,b:not(.w-\[10px\]),#plain`,
  ])('原生类名批处理保留完整选择器变换：%s', (selector) => {
    for (const customOptions of [{}, { escapeMap: { '[': 'OPEN', ']': 'CLOSE' } }, { uniAppX: true, uniAppXCssTarget: 'uvue' }] as Partial<IStyleHandlerOptions>[]) {
      function transform(mode: string) {
        vi.stubEnv('WEAPP_TW_NATIVE', mode)
        const root = postcss.parse(`${selector}{margin-left:calc(2px * var(--tw-space-x-reverse))}`)
        root.walkRules(rule => ruleTransformSync(rule, { ...customOptions }))
        return root.toString()
      }
      expect(transform('required')).toBe(transform('off'))
    }
  })

  it('真实 PostCSS 管线保留用户插件、颜色、单位与伪类转换', async () => {
    async function transform(mode: string) {
      vi.stubEnv('WEAPP_TW_NATIVE', mode)
      const handler = createStyleHandler({
        majorVersion: 4,
        cssPreflight: false,
        rem2rpx: true,
        postcssOptions: {
          plugins: [{
            postcssPlugin: 'native-selector-user-contract',
            Once(root) {
              root.append(postcss.rule({ selector: String.raw`.h-\[20px\]`, nodes: [postcss.decl({ prop: 'height', value: '20px' })] }))
            },
          }],
        },
      })
      return (await handler(String.raw`.w-\[10px\]:where(.a,.b){margin:1rem;color:oklch(0.7 0.15 30)}`)).css
    }
    const native = await transform('required')
    expect(native).toBe(await transform('off'))
    expect(native).toContain('h-_b20px_B')
    expect(native).toContain('32rpx')
    expect(native).not.toContain('oklch(')
  })
})
