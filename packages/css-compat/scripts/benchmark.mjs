import { Buffer } from 'node:buffer'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import postcss from 'postcss'
// eslint-disable-next-line antfu/no-import-dist -- 验证实际公开构建产物。
import { compileCascadeLayers } from '../dist/index.mjs'
// eslint-disable-next-line antfu/no-import-dist -- 验证实际公开构建产物。
import { consumeCascadeLayers } from '../dist/legacy.mjs'

const warmup = 3
const samples = 10
function measure(css, mode) {
  globalThis.gc?.()
  const before = process.memoryUsage().heapUsed
  const start = performance.now()
  const root = postcss.parse(css)
  const diagnostics = mode === 'legacy' ? (consumeCascadeLayers(root), []) : compileCascadeLayers(root, { mode: 'ordered' }).diagnostics
  return { ms: performance.now() - start, heapBytes: process.memoryUsage().heapUsed - before, outputBytes: Buffer.byteLength(root.toString()), diagnostics: diagnostics.length }
}
console.log(JSON.stringify({ node: process.version, platform: process.platform, arch: process.arch, warmup, samples, includesParsing: true, gc: Boolean(globalThis.gc) }))
for (const rules of [100, 1000, 10000]) {
  const safe = `@layer a,b;${Array.from({ length: rules }, (_, i) => `@layer ${i % 2 ? 'a' : 'b'}{.x${i}{color:red;background:blue!important}}`).join('')}`
  const conflict = `@layer a,b;@layer a{${Array.from({ length: rules / 2 }, (_, i) => `#x${i}{color:red}`).join('')}}@layer b{${Array.from({ length: rules / 2 }, (_, i) => `.x${i}{color:blue}`).join('')}}`
  for (const [name, css, mode] of [['ordered-mixed-repeated', safe, 'ordered'], ['ordered-conflicts', conflict, 'ordered'], ['legacy-anchor', safe, 'legacy']]) {
    const cold = measure(css, mode)
    for (let i = 0; i < warmup; i++) {
      measure(css, mode)
    }
    const results = Array.from({ length: samples }, () => measure(css, mode))
    const times = results.map(item => item.ms).sort((a, b) => a - b)
    console.log(JSON.stringify({ name, rules, inputBytes: Buffer.byteLength(css), coldMs: cold.ms, medianMs: (times[4] + times[5]) / 2, p95Ms: times[9], maxHeapBytes: Math.max(...results.map(item => item.heapBytes)), ...{ outputBytes: cold.outputBytes, diagnostics: cold.diagnostics } }))
  }
}
