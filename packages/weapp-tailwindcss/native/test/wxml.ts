import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { loadNativeCompiler } from '../../src/native'
import { Tokenizer } from '../../src/wxml/Tokenizer'
import { JavaScriptTokenizer } from '../../src/wxml/tokenizer/javascript'

const compiler = loadNativeCompiler()
assert.ok(compiler, 'Native compiler must be built before verification; fallback is not accepted')
const tokenizer = new Tokenizer()
const reference = new JavaScriptTokenizer()
const cases = [
  '', ' \t\n\v\f\r\u00A0\uFEFF', 'a\u2003b', 'w-[10px] h-[20px]',
  '2xl:text-xs rd-tag-{{type}}-{{theme}} {{prefix}}-btn',
  `{{n.attrs.href?'_a ':''}}{{n.attrs.class}}`,
  'a { b', '{a}}x', '{{a{{b}}}}', '{{a}b}}', '\\{{a}}', '{{"}}"}} tail',
  '😀 中文\uD800{{\uDC00}}\0',
]
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fixture = readFileSync(resolve(root, 'test/wxml/Tokenizer.test.ts'), 'utf8')
cases.push(fixture)
for (const segments of [
  ['demo', 'gulp-tailwindcss-v4', 'src', 'pages', 'index', 'index.wxml'],
  ['demo', 'weapp-vite-tailwindcss-v4', 'pages', 'index', 'index.wxml'],
  ['demo', 'weapp-vite-tailwindcss-v4', 'layouts', 'default', 'index.wxml'],
]) {
  cases.push(readFileSync(resolve(root, '../..', ...segments), 'utf8'))
}

let seed = 0x5eeda11
const alphabet = ['x', '{', '}', ' ', '\t', '\n', '\\', '"', "'", '中', '😀', '\uD800', '\uDC00', '\u00A0', '\uFEFF', '\u2003', '\0']
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
  return seed
}
for (let run = 0; run < 10_000; run++) {
  const length = random() % 100
  let input = ''
  for (let index = 0; index < length; index++) {
    input += alphabet[random() % alphabet.length]
  }
  cases.push(input)
}
for (const input of cases) {
  assert.deepEqual(tokenizer.run(input), reference.run(input), `Token mismatch for ${JSON.stringify(input)}`)
}

const source = 'w-[10px] rd-tag-{{ type }}-{{ theme }} {{prefix}}-btn 😀 中文\uD800 '.repeat(2_000)
const inputHash = createHash('sha256').update(Buffer.from(source, 'utf16le')).digest('hex')
assert.deepEqual(tokenizer.run(source), reference.run(source))
const nativeSamples: number[] = []
const referenceSamples: number[] = []
function sample(run: () => void) {
  const start = performance.now()
  run()
  return performance.now() - start
}
for (let run = 0; run < 60; run++) {
  const order = run % 2 === 0
    ? [[tokenizer, nativeSamples], [reference, referenceSamples]] as const
    : [[reference, referenceSamples], [tokenizer, nativeSamples]] as const
  for (const [scanner, samples] of order) {
    const elapsed = sample(() => scanner.run(source))
    if (run >= 10) {
      samples.push(elapsed)
    }
  }
}
function median(samples: number[]) {
  const sorted = [...samples].sort((a, b) => a - b)
  return (sorted[24]! + sorted[25]!) / 2
}
process.stdout.write(`${JSON.stringify({
  node: process.version,
  platform: `${process.platform}-${process.arch}`,
  parityCases: cases.length + 1,
  codeUnits: source.length,
  inputHash,
  warmups: 10,
  samples: 50,
  nativeMedianMs: median(nativeSamples),
  javascriptMedianMs: median(referenceSamples),
}, null, 2)}\n`)
