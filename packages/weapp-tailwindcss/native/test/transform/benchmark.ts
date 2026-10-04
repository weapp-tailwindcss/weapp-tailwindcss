import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { bindingPath, native } from './binding'
import { createInput } from './fixtures'
import { analyzeReference, transformReference } from './reference'

const names = ['w-[10px]', 'h-[20px]', 'p-[3px]', 'mt-[2px]', 'gap-[4px]', 'flex']
const classes = new Set(names)
const entries = Object.entries(MappingChars2String).map(([character, replacement]) => ({ character, replacement }))
const config = { lang: 'js', sourceType: 'module', preserveParens: false } as const
const options = { classNameSet: classes }
const input = createInput()
assert.equal(input.sha256, '21ad19ea581c664217f72ee2acebc73921de585c680e420c3de594deea09bcf3')
const instance = native.createJsTransformer(names, entries)!
const rounds = 3
const pairs = 20
const samples: { round: number, mode: 'cold' | 'warm', referenceMs: number, nativeMs: number }[] = []

function measure(run: () => string | undefined | null) {
  const start = performance.now()
  const code = run()
  return { code, ms: performance.now() - start }
}

for (let index = 0; index < 5; index++) {
  const source = input.sourceFor(99_000_000 + index)
  assert.equal(instance.transform(source, 'js', 'module', false, {}), transformReference(source, analyzeReference(source, config)!, options))
}
for (let round = 0; round < rounds; round++) {
  for (let index = 0; index < pairs; index++) {
    const source = input.sourceFor(round * pairs + index)
    const cold = () => transformReference(source, analyzeReference(source, config)!, options)
    const runNative = () => instance.transform(source, 'js', 'module', false, {})
    const first = index % 2 === 0 ? measure(cold) : measure(runNative)
    const second = index % 2 === 0 ? measure(runNative) : measure(cold)
    assert.equal(first.code, second.code)
    samples.push({ round, mode: 'cold', referenceMs: index % 2 === 0 ? first.ms : second.ms, nativeMs: index % 2 === 0 ? second.ms : first.ms })
    const analysis = analyzeReference(source, config)!
    const warm = () => transformReference(source, analysis, options)
    const third = index % 2 === 0 ? measure(runNative) : measure(warm)
    const fourth = index % 2 === 0 ? measure(warm) : measure(runNative)
    assert.equal(third.code, fourth.code)
    samples.push({ round, mode: 'warm', referenceMs: index % 2 === 0 ? fourth.ms : third.ms, nativeMs: index % 2 === 0 ? third.ms : fourth.ms })
  }
}

function median(values: number[]) {
  const sorted = values.toSorted((a, b) => a - b)
  return (sorted[(sorted.length - 1) >> 1]! + sorted[sorted.length >> 1]!) / 2
}

const summary = ['cold', 'warm'].map((mode) => {
  const rows = samples.filter(sample => sample.mode === mode)
  const referenceMs = median(rows.map(row => row.referenceMs))
  const nativeMs = median(rows.map(row => row.nativeMs))
  return { mode, referenceMs, nativeMs, speedup: referenceMs / nativeMs }
})
const setupCosts = [6, 1000, 10_000, 100_000].map((size) => {
  const classNames = [...names, ...Array.from({ length: size - names.length }, (_, index) => `utility-${index}`)]
  const changed = [...classNames.slice(0, -1), 'replacement-utility']
  const classSet = new Set(classNames)
  const construction: number[] = []
  const updates: number[] = []
  const snapshotChecks: number[] = []
  for (let index = 0; index < 5; index++) {
    const start = performance.now()
    const transformer = native.createJsTransformer(classNames, entries)!
    construction.push(performance.now() - start)
    const updateStart = performance.now()
    assert.equal(transformer.replaceClassNames(changed), true)
    updates.push(performance.now() - updateStart)
    const checkStart = performance.now()
    assert.equal(classNames.length === classSet.size && classNames.every(value => classSet.has(value)), true)
    snapshotChecks.push(performance.now() - checkStart)
  }
  return { size, constructMs: median(construction), updateMs: median(updates), snapshotCheckMs: median(snapshotChecks) }
})
const require = createRequire(import.meta.url)
const report = {
  node: process.version,
  oxc: require('oxc-parser/package.json').version,
  nativeSha256: createHash('sha256').update(readFileSync(bindingPath)).digest('hex'),
  nativeBytes: readFileSync(bindingPath).byteLength,
  input: { bytes: input.bytes, units: input.units, sha256: input.sha256 },
  rounds,
  pairs,
  parityChecks: 125,
  summary,
  setupCosts,
  samples,
}
if (process.argv[2]) {
  writeFileSync(process.argv[2], `${JSON.stringify(report, null, 2)}\n`)
}
process.stdout.write(`${JSON.stringify({ ...report, samples: undefined }, null, 2)}\n`)
