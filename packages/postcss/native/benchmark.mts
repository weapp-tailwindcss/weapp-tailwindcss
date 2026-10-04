import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import os from 'node:os'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { escape } from '@weapp-tailwindcss/escape'
import postcss from 'postcss'
import { escapeNativeSelectorClasses } from '../src/selectorParser/native'
import { ruleTransformSync } from '../src/selectorParser/rule-transformer'

const warmups = 8
const runs = 35
const rows: object[] = []

function measurePair(name: string, input: string, legacy: () => unknown, native: () => unknown) {
  assert.deepEqual(native(), legacy())
  const samples = { legacy: [] as number[], native: [] as number[] }
  const jobs = { legacy, native }
  for (let index = 0; index < runs + warmups; index++) {
    const order = index % 2 === 0 ? ['legacy', 'native'] as const : ['native', 'legacy'] as const
    for (const mode of order) {
      const start = performance.now()
      jobs[mode]()
      const elapsed = performance.now() - start
      if (index >= warmups) {
        samples[mode].push(elapsed)
      }
    }
  }
  const summary = Object.fromEntries(Object.entries(samples).map(([mode, values]) => {
    const sorted = [...values].sort((left, right) => left - right)
    return [mode, { medianMs: sorted[Math.floor(sorted.length / 2)], p95Ms: sorted[Math.floor(sorted.length * 0.95)], samples: values }]
  }))
  rows.push({ name, inputHash: createHash('sha256').update(input).digest('hex'), bytes: Buffer.byteLength(input), ...summary })
}

for (const count of [1, 8, 64]) {
  const values = Array.from({ length: count }, (_, index) => `hover:w-[${index}px]`)
  const selector = values.map(value => `.${value.replace(/[:[\]]/g, '\\$&')}`).join(',')
  const css = `${selector}{width:10px}`
  measurePair(`class-batch-${count}`, values.join('\n'), () => {
    let output: string[] = []
    for (let iteration = 0; iteration < 100; iteration++) {
      output = values.map(value => escape(value))
    }
    return output
  }, () => {
    process.env.WEAPP_TW_NATIVE = 'required'
    let output: string[] | undefined
    for (let iteration = 0; iteration < 100; iteration++) {
      output = escapeNativeSelectorClasses(values)
    }
    return output
  })
  const transform = (mode: string) => {
    process.env.WEAPP_TW_NATIVE = mode
    let output = ''
    for (let iteration = 0; iteration < 20; iteration++) {
      const root = postcss.parse(css)
      const options = {}
      root.walkRules(rule => ruleTransformSync(rule, options))
      output = root.toString()
    }
    return output
  }
  measurePair(`selector-root-${count}`, css, () => transform('off'), () => transform('required'))
}

process.stdout.write(`${JSON.stringify({
  environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: os.cpus()[0]?.model },
  method: { warmups, runs, alternating: true, scope: '已加载进程的类名批处理及无缓存选择器 root；不代表完整构建' },
  rows,
}, null, 2)}\n`)
