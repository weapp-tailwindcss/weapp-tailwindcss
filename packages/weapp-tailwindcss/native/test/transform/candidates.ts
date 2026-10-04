import type { NativeTransformer } from './binding'
import assert from 'node:assert/strict'
import process from 'node:process'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { createJsHandler } from '../../../src/js'
import { native } from './binding'

const transformer = native.createJsTransformer(['h-[2px]'], Object.entries(MappingChars2String).map(([character, replacement]) => ({ character, replacement })))!
assert.equal(typeof transformer.transformWithCandidates, 'function')
function transform(source: string, contains: (candidate: string) => boolean, options: Parameters<NativeTransformer['transform']>[4] = {}) {
  return transformer.transformWithCandidates(source, 'js', 'module', false, options, contains)
}

const source = 'const x = "w-[1px] h-[2px] w-[1px]"; const y = {className: "w-[1px]"}'
const matched = source.replaceAll('w-[1px]', 'w-_b1px_B')
const unmatched = source
let calls = 0
for (const size of [0, 6, 1_000, 10_000, 100_000]) {
  const classes = new Set(Array.from({ length: size }, (_, index) => `unrelated-${index}`))
  classes.add('w-[1px]')
  classes.add('\uD800')
  const queried: string[] = []
  assert.equal(transform(source, (candidate) => {
    queried.push(candidate)
    return classes.has(candidate)
  }), matched)
  assert.deepEqual(queried, ['w-[1px]', 'h-[2px]', 'h-_b2px_B'])
  calls += queried.length
  classes.delete('w-[1px]')
  classes.add('w-_b1px_B')
  assert.equal(transform(source, candidate => classes.has(candidate)), matched)
  classes.clear()
  assert.equal(transform(source, candidate => classes.has(candidate)), unmatched)
  classes.add('w-[1px]')
  assert.equal(transform(source, candidate => classes.has(candidate)), matched)

  // 公开 handler 的原生适配器必须保留同对象更新，不能复制全部类名。
  const handler = createJsHandler({ experimentalJsFastPath: 'oxc' })
  assert.equal(handler(source, classes).code, matched)
  classes.clear()
  assert.equal(handler(source, classes).code, unmatched)
  classes.add('h-[2px]')
  assert.equal(handler(source, classes).code, source.replaceAll('h-[2px]', 'h-_b2px_B'))
}

const mutableMap: Record<string, string> = { '[': '_left' }
const mappedClasses = new Set(['w-[1px]'])
const mappedHandler = createJsHandler({ experimentalJsFastPath: 'oxc', escapeMap: mutableMap })
assert.equal(mappedHandler(source, mappedClasses).code, source.replaceAll('w-[1px]', 'w-_left1px_B'))
mutableMap['['] = '_next'
assert.equal(mappedHandler(source, mappedClasses).code, source.replaceAll('w-[1px]', 'w-_next1px_B'))
delete mutableMap['[']
assert.equal(mappedHandler(source, mappedClasses).code, matched)

function noQuery(): never {
  throw new Error('不应查询集合')
}
for (const invalid of [
  'let x; let x; const cls = "w-[1px]"',
  'eval ("w-[1px]")',
  'const cls = "w-[1px]"; // weapp-tw ignore',
  'const cls = "\uD800"',
]) {
  assert.equal(transform(invalid, noQuery), null)
}
assert.equal(transform('import "x"; const cls = "w-[1px]"', noQuery, { moduleGraph: true }), null)
assert.equal(transform('const cls = tag`w-[1px]`', noQuery, { ignoreTaggedTemplates: true }), null)
assert.equal(transform('const cls = value === "w-[1px]" ? "" : ""', noQuery), 'const cls = value === "w-[1px]" ? "" : ""')
assert.equal(transform('const cls = "* pages/home"', noQuery, { preserveStar: true }), 'const cls = "* pages/home"')
assert.equal(transform('const cls = "w-[1px]"', noQuery, { alwaysEscape: true }), 'const cls = "w-_b1px_B"')

const error = new Error('membership identity')
assert.throws(() => transform(source, () => {
  throw error
}), caught => caught === error)
assert.equal(transform(source, candidate => candidate === 'w-[1px]'), matched)
assert.equal(transform(source, (candidate) => {
  assert(transformer.replaceClassNames(['w-[1px]']))
  assert.equal(transformer.transform('const x = "w-[1px]"', 'js', 'module', false, {}), 'const x = "w-_b1px_B"')
  assert.equal(transform(source, () => false), unmatched)
  for (let index = 0; index < 140; index++) {
    const nested = `const x = "w-[1px]"; // ${index}`
    assert.equal(transform(nested, () => true), nested.replace('w-[1px]', 'w-_b1px_B'))
  }
  return candidate === 'w-[1px]'
}), matched)
assert.equal(transform(source, () => false), unmatched)

process.stdout.write(`${JSON.stringify({ classSetSizes: [0, 6, 1_000, 10_000, 100_000], sameQueriesAtEverySize: 3, recordedQueries: calls, mutableSetLifecycle: true, exceptionIdentity: true, reentrantTransformer: true, storedClassesIgnored: true, performanceMeasured: false }, null, 2)}\n`)
