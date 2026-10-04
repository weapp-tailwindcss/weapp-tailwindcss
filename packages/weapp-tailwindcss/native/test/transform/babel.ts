import assert from 'node:assert/strict'
import process from 'node:process'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { getDefaultOptions } from '../../../src/defaults'
import { jsHandler } from '../../../src/js/babel'
import { defaultJsPreserveClass } from '../../../src/js/default-preserve'
import { native } from './binding'
import { classes, sources } from './fixtures'

const names = [...classes, 'pages/home', 'text/plain', 'http://example.com']
const transformer = native.createJsTransformer(names, Object.entries(MappingChars2String).map(([character, replacement]) => ({ character, replacement })))!
const contexts = [
  'const x = VALUE',
  'const x = {className: VALUE}',
  'const x = {className: [false, VALUE]}',
  'const x = {className: () => VALUE}',
  'const x = {className(){return VALUE}}',
  'const x = {get className(){return VALUE}}',
  'const x = {set className(v){const y = VALUE}}',
  'const x = cn({className(){return VALUE}})',
  'const x = {className: cond ? VALUE : ""}',
  'const x = {className: VALUE ? "" : ""}',
  'const x = {[className]: VALUE}',
  'const x = {[`className`]: VALUE}',
  'const x = {"hover-class": VALUE}',
  'const x = {root_class: { nested: VALUE }}',
  'const x = cn(VALUE)',
  'const x = clsx({ [VALUE]: true })',
  'const x = helpers.twMerge([VALUE])',
  'const x = helpers["TW-Merge"](VALUE)',
  'const x = helpers[cn](VALUE)',
  'const x = cn(...[VALUE])',
  'const x = cn?.(VALUE)',
  'const x = helpers?.cn(VALUE)',
  'const x = helpers.cn?.(VALUE)',
  'const x = notAClassHelper(VALUE)',
  'const x = "cn"(VALUE)',
  'const x = <view className={VALUE}/>',
  'const x = <view hover-class={VALUE}/>',
  'const x = <view other={VALUE}/>',
]
const contextSources = contexts.flatMap(context => ['"pages/home"', '`pages/home`', '"text/plain"', '"http://example.com"'].map(value => context.replace('VALUE', value)))
const cases = [...sources, ...contextSources, 'const x = `} w-[10px]`', 'const x = `w-[10px] {`', 'const x = `} w-[10px] {`', 'import "w-[10px]"', 'export { "w-[10px]" as alias } from "h-[20px]"', 'export * as "w-[10px]" from "h-[20px]"', 'let x; let x; const cls = "w-[10px]"', 'export { missing }; const cls = "w-[10px]"', 'break; const cls = "w-[10px]"', 'return "w-[10px]"']
const evalSources = ['eval ', 'eval /*comment*/ ', 'eval\n', 'eval?.'].map(prefix => `${prefix}(${JSON.stringify('const cls = value === "w-[10px]" ? "h-[20px]" : ""')})`)
cases.push(...evalSources, 'with (scope) { const cls = "w-[10px]" }', 'const legacy = "\\141"; const cls = "w-[10px]"', 'export default "w-[10px]"', 'const cls = "w-[10px]"; await foo()')
let compared = 0
let fallback = 0
const failures: object[] = []
for (const lang of ['js', 'jsx', 'ts', 'tsx'] as const) {
  for (const sourceType of ['script', 'module', 'unambiguous'] as const) {
    for (const preserveParens of [false, true]) {
      for (const unescapeUnicode of [false, true]) {
        const plugins: ('typescript' | 'jsx')[] = []
        if (lang === 'ts' || lang === 'tsx') {
          plugins.push('typescript')
        }
        if (lang === 'jsx' || lang === 'tsx') {
          plugins.push('jsx')
        }
        for (const source of cases) {
          const babel = jsHandler(source, { classNameSet: new Set(names), unescapeUnicode, babelParserOptions: { plugins, sourceType, createParenthesizedExpressions: preserveParens } })
          const actual = transformer.transform(source, lang, sourceType, preserveParens, { unescapeUnicode })
          if (evalSources.includes(source)) {
            assert.equal(actual, null, 'eval 参数必须交还 Babel 递归转译')
          }
          if (actual === null) {
            fallback++
            continue
          }
          if (actual !== babel.code || babel.error) {
            failures.push({ source, lang, sourceType, preserveParens, unescapeUnicode, actual, expected: babel.code, error: babel.error?.message })
          }
          compared++
        }
      }
    }
  }
}
assert.equal(getDefaultOptions().jsPreserveClass, defaultJsPreserveClass)
assert.equal(getDefaultOptions().jsPreserveClass, getDefaultOptions().jsPreserveClass)
const preserveSources = ['const cls = "* w-[10px]"', 'const cls = `* w-[10px]`', 'const cls = {className: "* w-[10px]"}', 'const cls = "** *:w-[10px] * w-[10px]"']
const preservedNames = ['*', '**', '*:w-[10px]', 'w-[10px]']
const preserveTransformer = native.createJsTransformer(preservedNames, Object.entries(MappingChars2String).map(([character, replacement]) => ({ character, replacement })))!
let preserveComparisons = 0
for (const alwaysEscape of [false, true]) {
  for (const source of preserveSources) {
    // 同一实例与同一解析结果交替切换，保留决策不能藏进解析缓存。
    for (const preserveStar of [true, false, true, false]) {
      const expected = jsHandler(source, { classNameSet: new Set(preservedNames), alwaysEscape, jsPreserveClass: preserveStar ? defaultJsPreserveClass : undefined, babelParserOptions: { sourceType: 'module' } })
      assert.equal(expected.error, undefined)
      const actual = preserveTransformer.transform(source, 'js', 'module', false, { alwaysEscape, preserveStar })
      assert.equal(actual, expected.code, JSON.stringify({ source, alwaysEscape, preserveStar }))
      preserveComparisons++
    }
  }
}
process.stdout.write(`${JSON.stringify({ compared, fallback, preserveComparisons, failures: failures.slice(0, 30), failureCount: failures.length }, null, 2)}\n`)
assert.equal(failures.length, 0)
assert.ok(compared > 3000, '确认有效输入真实进入 Rust 完整转译')
