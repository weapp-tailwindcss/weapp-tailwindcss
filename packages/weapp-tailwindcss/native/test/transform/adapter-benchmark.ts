import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { createInput } from '../../../benchmark/oxc-raw-transfer/input'
import { createJsHandler } from '../../../src/js'
import { getNativeBindingSuffix, loadNativeCompiler } from '../../../src/native'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '..')
const require = createRequire(import.meta.url)
const previous = process.env.WEAPP_TW_NATIVE
process.env.WEAPP_TW_NATIVE = 'required'
const compiler = loadNativeCompiler()!
const factory = compiler.createJsTransformer
const analyze = compiler.analyzeJs
let nativeTransforms = 0
let nativeStoredTransforms = 0
let nativeCandidateTransforms = 0
let nativeAnalyses = 0
let nativeFallbacks = 0
const restoreInstances: Array<() => void> = []
compiler.analyzeJs = (...args) => {
  nativeAnalyses++
  return analyze(...args)
}
compiler.createJsTransformer = (...args) => {
  const transformer = factory(...args)
  assert.ok(transformer)
  const originalTransform = transformer.transform
  const originalCandidates = transformer.transformWithCandidates
  const transformDescriptor = Object.getOwnPropertyDescriptor(transformer, 'transform')
  const candidatesDescriptor = Object.getOwnPropertyDescriptor(transformer, 'transformWithCandidates')
  const transform = originalTransform.bind(transformer)
  const transformWithCandidates = originalCandidates.bind(transformer)
  transformer.transform = (...input) => {
    nativeTransforms++
    nativeStoredTransforms++
    const output = transform(...input)
    if (output === null) {
      nativeFallbacks++
    }
    return output
  }
  transformer.transformWithCandidates = (...input) => {
    nativeTransforms++
    nativeCandidateTransforms++
    const output = transformWithCandidates(...input)
    if (output === null) {
      nativeFallbacks++
    }
    return output
  }
  restoreInstances.push(() => {
    if (transformDescriptor) {
      Object.defineProperty(transformer, 'transform', transformDescriptor)
    }
    else {
      Reflect.deleteProperty(transformer, 'transform')
    }
    if (candidatesDescriptor) {
      Object.defineProperty(transformer, 'transformWithCandidates', candidatesDescriptor)
    }
    else {
      Reflect.deleteProperty(transformer, 'transformWithCandidates')
    }
  })
  return transformer
}

interface Sample {
  size: number
  round: number
  pair: number
  phase: 'cold' | 'warm'
  offMs: number
  nativeMs: number
  inputSha256: string
  outputSha256: string
  nativeCalls: { transform: number, transformWithCandidates: number }
}
const samples: Sample[] = []
const input = createInput()
const selfCheck = process.argv.includes('--self-check')
const rounds = selfCheck ? 1 : 3
const pairs = selfCheck ? 1 : 20
const sizes = selfCheck ? [6] : [6, 1000, 10_000, 100_000]
const names = ['w-[10px]', 'h-[20px]', 'p-[3px]', 'mt-[2px]', 'gap-[4px]', 'flex']
const hash = (data: string | Uint8Array) => createHash('sha256').update(data).digest('hex')
const lockHash = hash(readFileSync(resolve(root, 'pnpm-lock.yaml')))
let bindingPath: string
try {
  bindingPath = require.resolve(`@weapp-tailwindcss/native-${getNativeBindingSuffix()}`)
}
catch {
  bindingPath = require.resolve(`weapp-tailwindcss/native/bindings/weapp-tailwindcss-native.${getNativeBindingSuffix()}.node`)
}
const packageRoot = resolve(root, 'packages', 'weapp-tailwindcss')
const sources = [join(packageRoot, 'src', 'native.ts'), fileURLToPath(import.meta.resolve('@weapp-tailwindcss/escape'))]
function collectSources(directory: string) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = join(directory, entry.name)
    if (entry.isDirectory()) {
      collectSources(file)
    }
    else if (entry.isFile()) {
      sources.push(file)
    }
  }
}
for (const folder of ['js', 'native']) {
  collectSources(join(packageRoot, 'src', folder))
}
const sourceHashes = Object.fromEntries(sources.sort().map(file => [relative(root, file), hash(readFileSync(file))]))
const bindingHash = hash(readFileSync(bindingPath))

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b)
  return (sorted[(sorted.length - 1) >> 1]! + sorted[sorted.length >> 1]!) / 2
}

try {
  for (const size of sizes) {
    const classes = new Set([...names, ...Array.from({ length: size - names.length }, (_, index) => `utility-${index}`)])
    const handler = createJsHandler({ experimentalJsFastPath: 'oxc', escapeMap: MappingChars2String, babelParserOptions: { sourceType: 'module' } })
    function measure(mode: 'off' | 'required', source: string) {
      process.env.WEAPP_TW_NATIVE = mode
      const before = nativeTransforms
      const storedBefore = nativeStoredTransforms
      const candidatesBefore = nativeCandidateTransforms
      const fallbacksBefore = nativeFallbacks
      const start = selfCheck ? 0 : performance.now()
      const result = handler(source, classes)
      const ms = selfCheck ? 0 : performance.now() - start
      assert.equal(result.error, undefined)
      assert.equal(nativeTransforms - before, mode === 'required' ? 1 : 0)
      assert.equal(nativeCandidateTransforms - candidatesBefore, mode === 'required' ? 1 : 0, '公开 adapter 必须实际调用候选查询 ABI')
      assert.equal(nativeStoredTransforms, storedBefore, '公开 adapter 不应重新复制完整类集合到旧接口')
      assert.equal(nativeFallbacks, fallbacksBefore, '固定基准输入必须由 Rust 返回最终代码，不能回退后计入原生收益')
      return { ms, code: result.code, nativeCalls: { transform: nativeStoredTransforms - storedBefore, transformWithCandidates: nativeCandidateTransforms - candidatesBefore } }
    }
    for (let warmup = 0; warmup < 5; warmup++) {
      const source = input.sourceFor(size * 100 + 90 + warmup)
      assert.equal(measure('off', source).code, measure('required', source).code)
    }
    for (let round = 0; round < rounds; round++) {
      for (let pair = 0; pair < pairs; pair++) {
        const source = input.sourceFor(size * 100 + round * pairs + pair)
        for (const phase of ['cold', 'warm'] as const) {
          const forward = (pair + round + (phase === 'warm' ? 1 : 0)) % 2 === 0
          const first = measure(forward ? 'off' : 'required', source)
          const second = measure(forward ? 'required' : 'off', source)
          assert.equal(first.code, second.code)
          samples.push({ size, round, pair, phase, offMs: forward ? first.ms : second.ms, nativeMs: forward ? second.ms : first.ms, inputSha256: hash(source), outputSha256: hash(first.code), nativeCalls: (forward ? second : first).nativeCalls })
        }
      }
    }
  }
  assert.equal(nativeAnalyses, 0, '完整路径不应落到紧凑事实接口')
  assert.equal(hash(readFileSync(resolve(root, 'pnpm-lock.yaml'))), lockHash)
  assert.equal(hash(readFileSync(bindingPath)), bindingHash)
  for (const [file, digest] of Object.entries(sourceHashes)) {
    assert.equal(hash(readFileSync(resolve(root, file))), digest)
  }
  const summary = sizes.flatMap(size => ['cold', 'warm'].map((phase) => {
    const rows = samples.filter(sample => sample.size === size && sample.phase === phase)
    const offMs = median(rows.map(row => row.offMs))
    const nativeMs = median(rows.map(row => row.nativeMs))
    return { size, phase, offMs, nativeMs, speedup: offMs / nativeMs }
  }))
  const report = {
    node: process.version,
    oxc: require('oxc-parser/package.json').version,
    platform: process.platform,
    arch: process.arch,
    lockSha256: lockHash,
    bindingSha256: bindingHash,
    bindingPath,
    sourceHashes,
    selfCheck,
    performanceMeasured: !selfCheck,
    input: { bytes: input.utf8Bytes, units: input.codeUnits, sha256: input.sha256 },
    rounds,
    pairs,
    nativeTransforms,
    nativeStoredTransforms,
    nativeCandidateTransforms,
    nativeAnalyses,
    nativeFallbacks,
    summary: selfCheck ? [] : summary,
    samples,
  }
  const outputArgument = process.argv.slice(2).find(value => value !== '--self-check')
  if (outputArgument) {
    const output = resolve(outputArgument)
    mkdirSync(dirname(output), { recursive: true })
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  }
  process.stdout.write(`${JSON.stringify({ ...report, samples: undefined }, null, 2)}\n`)
}
finally {
  compiler.createJsTransformer = factory
  compiler.analyzeJs = analyze
  for (const restore of restoreInstances.reverse()) {
    restore()
  }
  if (previous === undefined) {
    delete process.env.WEAPP_TW_NATIVE
  }
  else {
    process.env.WEAPP_TW_NATIVE = previous
  }
}
