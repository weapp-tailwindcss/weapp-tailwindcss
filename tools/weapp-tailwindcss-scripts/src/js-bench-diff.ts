/* empty */
// Per-file micro benchmark with diffing against a saved baseline.
// Usage:
//   pnpm --filter weapp-tailwindcss bench:js-diff
//   pnpm --filter weapp-tailwindcss bench:js-diff -- --engines=babel,oxc --iter=8 --warmup=1
//   pnpm --filter weapp-tailwindcss bench:js-diff -- --save=.bench/baseline.json
//   pnpm --filter weapp-tailwindcss bench:js-diff -- --compare=.bench/baseline.json
//   pnpm --filter weapp-tailwindcss bench:js-diff -- --glob="packages/weapp-tailwindcss/test/fixtures/js/**/*.js"
import type { IJsHandlerOptions } from 'weapp-tailwindcss/types'
import type { JsBenchmarkHandler, RunnableJsEngine } from './benchmark/js-engines'
import type { BenchSnapshot, PerEngineStats, PerFileResult } from './benchmark/js-snapshots'
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
import { compareToBabel, diffSnapshots, toSnapshot } from './benchmark/js-snapshots'
import { parseBenchmarkNumber } from './benchmark/options'
import { assertFiniteSamples, percentile } from './benchmark/statistics'
import { resolveCorePackagePath } from './paths'

interface RunOptions {
  engines: RunnableJsEngine[]
  glob: string | string[]
  iter: number
  warmup: number
  save?: string | undefined
  compare?: string | undefined
}

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

function parseArgs(): RunOptions {
  const args = process.argv.slice(2)
  const after = (a: string, p: string) => a.slice(p.length)
  const get = (k: string, d?: string) => {
    const p = `--${k}=`
    const v = args.find(a => a.startsWith(p))
    return v ? after(v, p) : d
  }
  const engines = parseJsBenchmarkEngines(get('engines'))
  const glob = get('glob', 'packages/weapp-tailwindcss/test/fixtures/**/*.{js,jsx,ts,tsx,wxs}')!
  const iter = parseBenchmarkNumber(get('iter'), 8, '--iter', 'positive-integer')
  const warmup = parseBenchmarkNumber(get('warmup'), 1, '--warmup', 'nonnegative-integer')
  const save = get('save')
  const compare = get('compare')
  return { engines, glob, iter, warmup, save, compare }
}

function now() {
  return performance.now()
}

async function loadFiles(globPattern: string | string[]) {
  const entries = await fg(globPattern, {
    cwd: repoRoot,
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
    alwaysEscape: true,
    needEscaped: true,
    generateMap: false,
    unescapeUnicode: true,
    escapeMap: MappingChars2String,
    experimentalJsFastPath: 'oxc',
    babelParserOptions: {
      sourceType: 'unambiguous',
    },
  }
}

function computeStats(samples: number[]): PerEngineStats {
  assertFiniteSamples(samples)
  const sorted = [...samples].sort((a, b) => a - b)
  const sum = samples.reduce((a, b) => a + b, 0)
  const mean = sum / samples.length
  return {
    iter: samples.length,
    samples,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    mean,
  }
}

async function benchPerFile(
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
  const results: PerFileResult[] = []

  for (const f of files) {
    // warmup once
    for (let w = 0; w < warmup; w++) {
      try {
        handler(f.code, options)
      }
      catch {
        // ignore
      }
    }
    const samples: number[] = []
    for (let i = 0; i < iter; i++) {
      const t0 = now()
      let res = handler(f.code, options)
      if ((!res || typeof res.code !== 'string') && fallbackHandler) {
        res = fallbackHandler(f.code, options)
      }
      if (!res || typeof res.code !== 'string') {
        throw new Error(`${id} returned invalid result for ${f.id}`)
      }
      samples.push(now() - t0)
    }
    results.push({
      id: f.id,
      engines: {
        [id]: computeStats(samples),
      },
    })
  }
  return results
}

function mergePerEngine(a: PerFileResult[], b: PerFileResult[]) {
  const map = new Map<string, PerFileResult>()
  for (const r of a) {
    map.set(r.id, r)
  }
  for (const r of b) {
    const ex = map.get(r.id)
    if (!ex) {
      map.set(r.id, r)
      continue
    }
    map.set(r.id, {
      id: r.id,
      engines: { ...ex.engines, ...r.engines },
    })
  }
  return [...map.values()]
}

async function saveSnapshot(pathname: string, snap: BenchSnapshot) {
  await fs.outputJson(path.resolve(repoRoot, pathname), snap, { spaces: 2 })
}

async function loadSnapshot(pathname: string): Promise<BenchSnapshot | undefined> {
  const abs = path.resolve(repoRoot, pathname)
  if (!(await fs.pathExists(abs))) {
    return undefined
  }
  return fs.readJson(abs)
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

  console.log(pc.cyan(`Per-file JS Handler Benchmark`))
  console.log(`  files: ${files.length}`)
  console.log(`  engines: ${args.engines.join(', ')}`)
  console.log(`  iter: ${args.iter}, warmup: ${args.warmup}`)

  let merged: PerFileResult[] = []
  for (const id of args.engines) {
    try {
      const res = await benchPerFile(id, files, baseOpts, args.iter, args.warmup)
      merged = mergePerEngine(merged, res)
      console.log(pc.green(`done: ${id}`))
    }
    catch (error) {
      throw new Error(`${id} failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
  }

  const snap = toSnapshot(args.engines, args.iter, args.warmup, args.glob, merged)

  // show relative to Babel for current run
  const ratios = compareToBabel(merged)
  console.log('')
  console.log(pc.bold('Relative to Babel (median, positive means faster):'))
  for (const r of ratios.slice(0, 20)) {
    const swc = r.swcVsBabel ? `swc ${r.swcVsBabel}` : ''
    const oxc = r.oxcVsBabel ? `oxc ${r.oxcVsBabel}` : ''
    console.log(`  ${r.file}: ${swc} ${oxc}`.trim())
  }
  if (ratios.length > 20) {
    console.log(`  ... and ${ratios.length - 20} more`)
  }

  if (args.compare) {
    const base = await loadSnapshot(args.compare)
    if (base) {
      console.log('')
      console.log(pc.bold(`Diff vs baseline: ${args.compare}`))
      const deltas = diffSnapshots(snap, base)
      for (const d of deltas.slice(0, 20)) {
        const sign = d.deltaMs >= 0 ? pc.red('+') : pc.green('')
        console.log(`  ${d.engine} ${d.file}: ${sign}${d.deltaMs.toFixed(2)} ms (${d.deltaPct})`)
      }
      if (deltas.length > 20) {
        console.log(`  ... and ${deltas.length - 20} more`)
      }
    }
    else {
      console.log(pc.yellow(`Baseline not found: ${args.compare}`))
    }
  }

  if (args.save) {
    await saveSnapshot(args.save, snap)
    console.log(pc.cyan(`Saved snapshot to ${args.save}`))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
