import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import postcss from 'postcss'
import { normalizeTailwindcssV4Declaration } from '../src/compat/tailwindcss-v4/declarations'
import { normalizeV4VariableFallbacksLegacy } from '../src/compat/tailwindcss-v4/declarations/variable-fallbacks'
import { normalizeUniAppXTransformValue, normalizeUniAppXTransformValues } from '../src/compat/uni-app-x-uvue/transform-value'
import { loadNativeCssBinding } from '../src/native/binding'

const runs = 35
const warmups = 8
const rows: object[] = []
process.env.WEAPP_TW_NATIVE = 'required'
const binding = loadNativeCssBinding()!

function measure(name: string, source: string, legacy: () => unknown, native: () => unknown) {
  assert.deepEqual(native(), legacy())
  const samples = { legacy: [] as number[], native: [] as number[] }
  const jobs = { legacy, native }
  for (let index = 0; index < warmups + runs; index++) {
    for (const mode of index % 2 === 0 ? ['legacy', 'native'] as const : ['native', 'legacy'] as const) {
      const start = performance.now()
      jobs[mode]()
      const elapsed = performance.now() - start
      if (index >= warmups) {
        samples[mode].push(elapsed)
      }
    }
  }
  rows.push({
    name,
    bytes: Buffer.byteLength(source),
    inputHash: createHash('sha256').update(source).digest('hex'),
    ...Object.fromEntries(Object.entries(samples).map(([mode, values]) => {
      const sorted = [...values].sort((left, right) => left - right)
      return [mode, { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * 0.95)], samples: values }]
    })),
  })
}

const value = 'var(--tw-gradient-via-stops, var(--tw-gradient-position), var(--tw-gradient-from) var(--tw-gradient-from-position), var(--tw-gradient-to) var(--tw-gradient-to-position))'
measure('gradient-fallback-1000', value, () => {
  let result = ''
  for (let i = 0; i < 1000; i++) {
    result = normalizeV4VariableFallbacksLegacy(value)
  }
  return result
}, () => {
  let result: string | null = ''
  for (let i = 0; i < 1000; i++) {
    result = binding.normalizeV4VariableFallbacks(value)
  }
  return result
})

const transform = 'translate(var(--x, 0), var(--y, 0)) rotate(45deg)'
function uvue(mode: string) {
  process.env.WEAPP_TW_NATIVE = mode
  let result = ''
  for (let i = 0; i < 1000; i++) {
    result = normalizeUniAppXTransformValue(transform)
  }
  return result
}
measure('uvue-translate-1000', transform, () => uvue('off'), () => uvue('required'))

const batch = Array.from({ length: 256 }, (_, index) => `translate(var(--x-${index}, 0), var(--y-${index}, 0)) rotate(45deg)`)
function uvueBatch(mode: string) {
  process.env.WEAPP_TW_NATIVE = mode
  return normalizeUniAppXTransformValues(batch)
}
measure('uvue-translate-batch-256', batch.join('\n'), () => uvueBatch('off'), () => uvueBatch('required'))

for (const fixture of ['v4.css', 'v4-postcss.css', 'nutui/style.css']) {
  const css = readFileSync(new URL(`../test/fixtures/css/${fixture}`, import.meta.url), 'utf8')
  const declarations = (mode: string) => {
    process.env.WEAPP_TW_NATIVE = mode
    const root = postcss.parse(css)
    root.walkDecls((decl) => {
      normalizeTailwindcssV4Declaration(decl)
    })
    return root.toString()
  }
  measure(`v4-declarations-${fixture}`, css, () => declarations('off'), () => declarations('required'))
}

process.stdout.write(`${JSON.stringify({
  environment: {
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    cpu: os.cpus()[0]?.model,
    dependencies: Object.fromEntries(['postcss', 'postcss-value-parser'].map(name => [name, JSON.parse(readFileSync(new URL(`../node_modules/${name}/package.json`, import.meta.url), 'utf8')).version])),
    nativeBinaryHash: createHash('sha256').update(readFileSync(new URL('./weapp-tailwindcss-postcss.node', import.meta.url))).digest('hex'),
  },
  method: { runs, warmups, alternating: true, scope: '值转换微基准及 PostCSS parse/v4 声明转换/stringify；不含完整平台管线或框架构建' },
  rows,
}, null, 2)}\n`)
