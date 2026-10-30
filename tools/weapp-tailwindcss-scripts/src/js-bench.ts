/* empty */
// Babel/OXC 低级 JS handler 微基准；SWC 仅保留历史快照读取。
// Usage:
//   pnpm --filter weapp-tailwindcss bench:js-handlers
//   pnpm --filter weapp-tailwindcss bench:js-handlers -- --engines=babel,oxc --iter=5 --warmup=1
//   pnpm --filter weapp-tailwindcss bench:js-handlers -- --glob="packages/weapp-tailwindcss/test/fixtures/jsx/**/*.js"
//
// Notes:
// - SWC 实现已退役，显式选择时在读取输入前报错。
// - OXC uses the experimental JS fast path when oxc-parser is available.
// - We focus on transform hot-path. For fairness and determinism, we run with:
//   { alwaysEscape: true, needEscaped: true, generateMap: false }
//   so the handlers do roughly the same amount of work regardless of classNameSet.
import type { IJsHandlerOptions } from 'weapp-tailwindcss/types'
import type { JsBenchmarkHandler, RunnableJsEngine } from './benchmark/js-engines'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import fg from 'fast-glob'
import fs from 'fs-extra'
import pc from 'picocolors'
import { loadJsBenchmarkHandler, parseJsBenchmarkEngines } from './benchmark/js-engines'
import { parseBenchmarkNumber } from './benchmark/options'
import { percentile } from './benchmark/statistics'
import { resolveCorePackagePath } from './paths'

// Resolve repo root independenty of CWD.
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '../../..')
const require = createRequire(import.meta.url)

function registerCoreAlias() {
  const Module = require('node:module') as typeof import('node:module') & {
    _resolveFilename?: (request: string, parent: unknown, isMain: boolean, options?: unknown) => string
  }
  const original = Module._resolveFilename
  if (!original) {
    return
  }
  Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
    if (request.startsWith('@/')) {
      return original.call(this, resolveCorePackagePath('src', request.slice(2)), parent, isMain, options)
    }
    return original.call(this, request, parent, isMain, options)
  }
}

registerCoreAlias()

interface RunOptions {
  engines: RunnableJsEngine[]
  glob: string | string[]
  iter: number
  warmup: number
}

function parseArgs(): RunOptions {
  const args = process.argv.slice(2)
  const aAfter = (a: string, p: string) => a.slice(p.length)
  const get = (k: string, d?: string) => {
    const p = `--${k}=`
    const v = args.find(a => a.startsWith(p))
    return v ? aAfter(v, p) : d
  }
  const engines = parseJsBenchmarkEngines(get('engines'))
  const glob = get('glob', 'packages/weapp-tailwindcss/test/fixtures/**/*.{js,jsx,ts,tsx,wxs}')!
  const iter = parseBenchmarkNumber(get('iter'), 5, '--iter', 'positive-integer')
  const warmup = parseBenchmarkNumber(get('warmup'), 1, '--warmup', 'nonnegative-integer')
  return { engines, glob, iter, warmup }
}

function now() {
  return performance.now()
}

function toFixed2(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : String(n)
}

async function loadFiles(globPattern: string | string[]) {
  const absCwd = repoRoot
  const entries = await fg(globPattern, {
    cwd: absCwd,
    absolute: true,
    dot: false,
    onlyFiles: true,
    suppressErrors: true,
  })
  const items: { id: string, code: string }[] = []
  for (const id of entries) {
    const code = await fs.readFile(id, 'utf8')
    items.push({ id, code })
  }
  return items
}

function makeBaseOptions(): IJsHandlerOptions {
  return {
    // 保留原基准选项与测量工作量。
    alwaysEscape: true,
    needEscaped: true,
    generateMap: false,
    unescapeUnicode: true,
    escapeMap: MappingChars2String,
    experimentalJsFastPath: 'oxc',
    // Keep eval/require/module specifier replacements in POC path disabled by default here.
    // They can be added per-case using extra options if desired.
    babelParserOptions: {
      sourceType: 'unambiguous',
    },
  }
}

async function runEngine(
  id: RunnableJsEngine,
  files: { id: string, code: string }[],
  options: IJsHandlerOptions,
  iter: number,
  warmup: number,
) {
  const handler = await loadJsBenchmarkHandler(id)
  const fallbackHandler: JsBenchmarkHandler | undefined = id === 'oxc'
    ? await loadJsBenchmarkHandler('babel')
    : undefined

  // Warmup
  for (let w = 0; w < warmup; w++) {
    for (const f of files) {
      try {
        handler(f.code, options)
      }
      catch {
        // ignore
      }
    }
  }

  // Measure
  const perRunDurations: number[] = []
  let fallbackCount = 0
  const t0 = now()
  for (let r = 0; r < iter; r++) {
    const rStart = now()
    for (const f of files) {
      let res = handler(f.code, options)
      if ((!res || typeof res.code !== 'string') && fallbackHandler) {
        fallbackCount++
        res = fallbackHandler(f.code, options)
      }
      if (!res || typeof res.code !== 'string') {
        throw new Error(`${id} returned invalid result for ${f.id}`)
      }
    }
    perRunDurations.push(now() - rStart)
  }
  const total = now() - t0

  perRunDurations.sort((a, b) => a - b)
  const med = percentile(perRunDurations, 50)
  const p95 = percentile(perRunDurations, 95)
  const filesPerSec = (files.length * iter) / (total / 1000)

  return { total, med, p95, filesPerSec, fallbackCount, runs: iter, files: files.length }
}

async function main() {
  const args = parseArgs()
  const files = await loadFiles(args.glob)
  if (files.length === 0) {
    console.log(pc.yellow(`No files matched: ${args.glob}`))
    process.exitCode = 1
    return
  }
  const baseOpts = makeBaseOptions()

  console.log(pc.cyan(`JS Handler Benchmark`))
  console.log(`  files: ${files.length}`)
  console.log(`  engines: ${args.engines.join(', ')}`)
  console.log(`  iter: ${args.iter}, warmup: ${args.warmup}`)
  console.log('')

  for (const id of args.engines) {
    try {
      const result = await runEngine(id, files, baseOpts, args.iter, args.warmup)
      const { total, med, p95, filesPerSec, fallbackCount, runs, files: fcount } = result
      console.log(pc.bold(`${id}`))
      console.log(`  total: ${toFixed2(total)} ms  (${runs} runs × ${fcount} files)`)
      console.log(`  median per-run: ${toFixed2(med)} ms`)
      console.log(`  p95 per-run:    ${toFixed2(p95)} ms`)
      console.log(`  throughput:     ${toFixed2(filesPerSec)} files/s`)
      if (fallbackCount > 0) {
        console.log(`  fallback:       ${fallbackCount} files`)
      }
      console.log('')
    }
    catch (error) {
      throw new Error(`${id} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
