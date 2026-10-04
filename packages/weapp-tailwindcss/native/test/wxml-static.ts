import type { ITemplateHandlerOptions } from '../../src/types'
import type { NativeWxmlCompiler } from '../../src/wxml/native/types'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Parser } from 'htmlparser2'
import MagicString from 'magic-string'
import { loadNativeCompiler } from '../../src/native'
import { getNativeWxmlEscapeEntries } from '../../src/wxml/native/escape'
import { nativeStaticTemplateReplacer } from '../../src/wxml/native/static'
import { JavaScriptTokenizer } from '../../src/wxml/tokenizer/javascript'
import { handleEachClassFragment } from '../../src/wxml/utils/fragment-updater'
import { templateReplacer } from '../../src/wxml/utils/template-fragments'

const compiler = loadNativeCompiler() as (ReturnType<typeof loadNativeCompiler> & NativeWxmlCompiler)
assert(compiler?.createWxmlTransformer, 'Build the native WXML static transformer before ABI verification')
const transformer = compiler.createWxmlTransformer(getNativeWxmlEscapeEntries()!)!
assert(transformer)
const scanner = new JavaScriptTokenizer()
function reference(source: string, options: ITemplateHandlerOptions = {}) {
  const result = new MagicString(source)
  handleEachClassFragment(result, scanner.run(source), options)
  return result.toString()
}

const cases = [
  '',
  ' \t\n\r\v\f\u00A0\uFEFF',
  'w-[1px] h-[2px]',
  '\r\n w-[1px]\r \u00A0w-[2px]\n',
  '- -- -1 2xl:w-[1px]',
  '😀 中\uD800\uDC00 \uDC00 \uD800',
  'a\u2003b w-[1px]\u2003w-[2px]',
  'a { w-[1px]\n w-[2px]',
  '{0\r\n1',
  '{\uD800\n\uDC00',
  'before:content-[\'a b\']',
  'w-[1px]\0',
  ' \u1680\u2028\u2029\u202F\u205F\u3000\u200B',
]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..')
for (const parts of [
  ['demo', 'gulp-tailwindcss-v4', 'src', 'pages', 'index', 'index.wxml'],
  ['demo', 'weapp-vite-tailwindcss-v4', 'pages', 'index', 'index.wxml'],
  ['demo', 'weapp-vite-tailwindcss-v4', 'layouts', 'default', 'index.wxml'],
]) {
  const parser = new Parser({
    onattribute(name, value) {
      if (['class', 'hover-class', 'virtualhostclass'].includes(name.toLowerCase())
        && scanner.run(value).every(token => token.expressions.length === 0)) {
        cases.push(value)
      }
    },
  }, { xmlMode: true })
  parser.end(readFileSync(resolve(root, ...parts), 'utf8'))
}
let seed = 0x77A11
const alphabet = ['x', '0', '2', '-', '[', ']', ':', '/', '\0', '{', ' ', '\r', '\n', '\t', '\v', '\f', '\\', '中', '😀', '\uD800', '\uDC00', '\u00A0', '\uFEFF', '\u2003', '\u2028', '\u2029', '\u200B']
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed
}
for (let run = 0; run < 10_000; run++) {
  let source = ''
  const length = random() % 80
  for (let index = 0; index < length; index++) {
    source += alphabet[random() % alphabet.length]
  }
  cases.push(source)
}
let predicateCalls = 0
for (const source of cases) {
  assert.equal(transformer.transformStatic(source), reference(source), `all ABI mismatch: ${JSON.stringify(source)}`)
  assert.equal(nativeStaticTemplateReplacer(source, {}), reference(source), `all adapter mismatch: ${JSON.stringify(source)}`)
  const candidates = scanner.run(source).flatMap(token => token.value.match(/\S+/g) ?? [])
  const runtimeSet = new Set(candidates.filter((_, index) => index % 2 === 0))
  const actualCandidates: string[] = []
  const output = transformer.transformStatic(source, (candidate) => {
    actualCandidates.push(candidate)
    return runtimeSet.has(candidate)
  })
  assert.equal(output, reference(source, { classSetMode: 'exact', runtimeSet }), `exact ABI mismatch: ${JSON.stringify(source)}`)
  assert.deepEqual(actualCandidates, candidates, 'Only actual candidates may cross the membership ABI')
  predicateCalls += actualCandidates.length
  assert.equal(nativeStaticTemplateReplacer(source, { classSetMode: 'exact', runtimeSet }), output)
}

for (const map of [{ '[': '<', ']': '', '-': '-', '2': '2' }, { '[': '\uD800', ']': '😀' }, { ' ': '$&', '\t': 'TAB' }]) {
  const native = compiler.createWxmlTransformer(getNativeWxmlEscapeEntries(map)!)!
  for (const source of cases.slice(0, 500)) {
    assert.equal(native.transformStatic(source), reference(source, { escapeMap: map }))
  }
}

for (const source of ['x {{foo}} y', 'w-[1px] {a}} w-[2px]', '{{class}}', '{{a}b}}']) {
  assert.equal(transformer.transformStatic(source, () => {
    throw new Error('Dynamic fallback must not call membership')
  }), null)
  assert.equal(nativeStaticTemplateReplacer(source, {}), undefined)
  assert.equal(templateReplacer(source), reference(source))
}
const predicateError = new Error('membership identity')
assert.throws(() => transformer.transformStatic('w-[1px]', () => {
  throw predicateError
}), error => error === predicateError)
const exactSet = new Set(['w-[1px]'])
const source = 'w-[1px] w-[2px]'
assert.equal(nativeStaticTemplateReplacer(source, { classSetMode: 'exact', runtimeSet: exactSet }), 'w-_b1px_B w-[2px]')
exactSet.clear()
exactSet.add('w-[2px]')
assert.equal(nativeStaticTemplateReplacer(source, { classSetMode: 'exact', runtimeSet: exactSet }), 'w-[1px] w-_b2px_B')
assert.equal(transformer.transformStatic('w-[1px]', () => {
  assert.equal(transformer.transformStatic('w-[2px]'), 'w-_b2px_B')
  return true
}), 'w-_b1px_B')

process.stdout.write(`${JSON.stringify({
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  staticCases: cases.length,
  inputSha256Utf16le: createHash('sha256').update(Buffer.from(JSON.stringify(cases), 'utf16le')).digest('hex'),
  exactPredicateCalls: predicateCalls,
  customMappingCases: 1_500,
  dynamicFallbackCases: 4,
  exceptionIdentity: true,
  reentrantTransformer: true,
  performanceMeasured: false,
}, null, 2)}\n`)
