import assert from 'node:assert/strict'
import process from 'node:process'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { jsHandler } from '../../../src/js/babel'
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
let compared = 0
let fallback = 0
const failures: object[] = []
for (const lang of ['js', 'jsx', 'ts', 'tsx'] as const) {
  for (const sourceType of ['script', 'module'] as const) {
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
process.stdout.write(`${JSON.stringify({ compared, fallback, failures: failures.slice(0, 30), failureCount: failures.length }, null, 2)}\n`)
assert.equal(failures.length, 0)
assert.ok(compared > 3000, '确认有效输入真实进入 Rust 完整转译')
