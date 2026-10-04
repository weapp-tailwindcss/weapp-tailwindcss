import type { IJsHandlerOptions } from '@/types'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it, vi } from 'vitest'
import { createJsHandler } from '@/js'
import * as babel from '@/js/babel'
import { oxcJsHandler } from '@/js/fast-path/oxc'

const options: IJsHandlerOptions = {
  escapeMap: MappingChars2String,
  classNameSet: new Set(['w-[1px]', 'h-[2px]', 'm-[3px]', 'p-[4px]']),
  needEscaped: true,
  unescapeUnicode: true,
  experimentalJsFastPath: 'oxc',
  generateMap: false,
  filename: 'entry.tsx',
  babelParserOptions: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
}

const wrappers: [string, (value: string) => string][] = [
  ['direct', value => value],
  ['parenthesized', value => `(${value})`],
  ['double parenthesized', value => `((${value}))`],
  ['binary', value => `value === ${value}`],
  ['call', value => `matches(${value})`],
  ['member', value => `values[${value}]`],
  ['logical', value => `enabled && ${value}`],
  ['unary', value => `!${value}`],
  ['optional call', value => `matches?.(${value})`],
  ['optional member', value => `values?.[${value}]`],
  ['optional call chain', value => `helpers?.matches(${value})`],
  ['optional member chain', value => `values?.items[${value}]`],
  ['TS as', value => `(${value} as string)`],
  ['TS satisfies', value => `(${value} satisfies string)`],
  ['TS non-null', value => `(${value})!`],
  ['sequence', value => `(value, ${value})`],
  ['assignment', value => `(value = ${value})`],
  ['array', value => `[${value}]`],
  ['object value', value => `({ value: ${value} })`],
  ['object key', value => `({ [${value}]: value })`],
  ['arrow', value => `(() => ${value})`],
  ['nested test', value => `(${value} ? "h-[2px]" : "m-[3px]")`],
  ['nested branch', value => `(enabled ? ${value} : "m-[3px]")`],
  ['new', value => `new Thing(${value})`],
]

describe.each([false, true])('Oxc/Babel 条件语义，显式括号节点=%s', (createParenthesizedExpressions) => {
  it.each(wrappers)('保持双层 %s 父表达式与字面量矩阵一致', (_name, outer) => {
    const current = {
      ...options,
      babelParserOptions: { ...options.babelParserOptions, createParenthesizedExpressions },
    }
    // eslint-disable-next-line no-template-curly-in-string -- 输入必须保留模板插值。
    const atoms = ['"w-[1px]"', '`w-[1px]`', '`w-[1px]${value}`', '"\\u0077-[1px]"']
    for (const [, inner] of wrappers) {
      for (const atom of atoms) {
        const source = `const cls = ${outer(inner(atom))} ? "p-[4px]" : "plain";`
        const actual = oxcJsHandler(source, current)
        expect(actual, source).toBeDefined()
        expect(actual?.code, source).toBe(babel.jsHandler(source, current).code)
      }
    }
  })
})

describe('Oxc/Babel 字面量边界', () => {
  it.each(['js', 'jsx', 'ts', 'tsx'])('保持 %s 中比较值不变并转译结果类名', (extension) => {
    const source = 'const cls = value === "w-[1px]" ? "h-[2px]" : "plain"'
    const actual = oxcJsHandler(source, { ...options, filename: `entry.${extension}` })
    expect(actual?.code).toBe('const cls = value === "w-[1px]" ? "h-_b2px_B" : "plain"')
  })

  it.each([
    '"w-[1px]"; const cls = "h-[2px]";',
    'function render() { "w-[1px]"; return "h-[2px]"; }',
    'const render = () => { "w-[1px]"; return "h-[2px]"; };',
    '("w-[1px]"); const cls = "h-[2px]";',
    'const n = 1; "w-[1px]"; const cls = "h-[2px]";',
  ])('保留 directive 并正常处理非 directive 字面量：%s', (source) => {
    expect(oxcJsHandler(source, options)?.code).toBe(babel.jsHandler(source, options).code)
  })

  it.each(['w-&#91;1px&#93;', 'w-&#x5b;1px&#x5d;', '&quot;', '&apos;', '&amp;'])('JSX 实体 %s 使用 Babel 解码', (value) => {
    const source = `const view = <view className="${value} h-[2px]"/>`
    expect(oxcJsHandler(source, options)).toBeUndefined()
    const spy = vi.spyOn(babel, 'jsHandler')
    try {
      const handler = createJsHandler(options)
      expect(handler('const view = <view className="h-[2px]"/>', options.classNameSet!, options).code).toContain('h-_b2px_B')
      expect(spy).not.toHaveBeenCalled()
      const actual = handler(source, options.classNameSet!, options)
      expect(spy).toHaveBeenCalledOnce()
      expect(actual.code).toBe(babel.jsHandler(source, options).code)
      expect(actual.code).toContain('h-_b2px_B')
    }
    finally {
      spy.mockRestore()
    }
  })

  it('普通 JS 和 JSX 表达式中的 & 不触发实体回退', () => {
    const source = 'const amp = "&"; const view = <view className={"w-[1px] &"}/>'
    expect(oxcJsHandler(source, options)?.code).toBe(babel.jsHandler(source, options).code)
  })
})
