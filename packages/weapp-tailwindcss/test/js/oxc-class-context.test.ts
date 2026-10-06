import { afterEach, describe, expect, it, vi } from 'vitest'
import { createJsHandler } from '@/js'
import { jsHandler } from '@/js/babel'
import { oxcJsHandler } from '@/js/fast-path/oxc'

afterEach(() => vi.unstubAllEnvs())

const contexts = [
  'const x = "pages/home"',
  'const x = { className: "pages/home" }',
  'const x = { ["hover-class"]: ["pages/home"] }',
  'const x = { className: () => "pages/home" }',
  'const x = { className() { return "pages/home" } }',
  'const x = { get className() { return "pages/home" } }',
  'const x = { [`className`]: "pages/home" }',
  'const x = { className: { "pages/home": true } }',
  'const x = cn("pages/home")',
  'const x = cn(format("pages/home"))',
  'const x = "cn"("pages/home")',
  'const x = helper[clsx]("pages/home")',
  'const x = helper["cn"]("pages/home")',
  'const x = cn?.("pages/home")',
  'const x = { className: enabled ? "pages/home" : "plain" }',
  'const x = helper?.cn("pages/home")',
  'const x = helper?.cn?.("pages/home")',
  'const x = `} w-[10px]`',
  'const x = `w-[10px] {`',
  'const x = `} w-[10px] {`',
  // eslint-disable-next-line no-template-curly-in-string -- 保留源程序的插值边界。
  'const x = `} w-[10px] ${value} w-[10px] {`',
]

describe('Oxc class 上下文与模板正文边界', () => {
  it.each(['off', 'required'])('特殊 Babel 解析选项在 %s 模式下仍受保护', (mode) => {
    vi.stubEnv('WEAPP_TW_NATIVE', mode)
    const source = 'with (scope) { const cls = "w-[10px]" }'
    const options = {
      experimentalJsFastPath: 'oxc' as const,
      babelParserOptions: { sourceType: 'script' as const, strictMode: true },
    }
    const result = createJsHandler(options)(source, new Set(['w-[10px]']))
    expect(result.code).toBe(source)
    expect(result.error).toBeDefined()
  })

  it.each(['js', 'jsx', 'ts', 'tsx'])('%s 与 Babel 保持一致', (lang) => {
    // 此文件单独证明 JavaScript 回退路径，真实 Rust ABI 由 native/test/js.ts 覆盖。
    vi.stubEnv('WEAPP_TW_NATIVE', 'off')
    const sources = [...contexts]
    if (lang === 'jsx' || lang === 'tsx') {
      sources.push('const x = <view className="pages/home" />', 'const x = <view className={["pages/home"]} />', 'const x = <view data-path="pages/home" />')
    }
    for (const source of sources) {
      const options = {
        filename: `entry.${lang}`,
        experimentalJsFastPath: 'oxc' as const,
        classNameSet: new Set(['pages/home', 'w-[10px]']),
        babelParserOptions: { sourceType: 'module' as const, plugins: ['typescript', 'jsx'] as ('typescript' | 'jsx')[] },
      }
      const expected = jsHandler(source, options)
      expect(expected.error, source).toBeUndefined()
      expect(oxcJsHandler(source, options)?.code, source).toBe(expected.code)
    }
  })
})
