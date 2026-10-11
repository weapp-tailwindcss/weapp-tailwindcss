/* empty */
// Per-file micro benchmark with diffing against a saved baseline.
// Usage:
//   pnpm --filter weapp-tailwindcss bench:js-diff
//   pnpm --filter weapp-tailwindcss bench:js-diff -- --engines=babel,swc,oxc --iter=8 --warmup=1
//   pnpm --filter weapp-tailwindcss bench:js-diff -- --save=.bench/baseline.json
//   pnpm --filter weapp-tailwindcss bench:js-diff -- --compare=.bench/baseline.json
//   pnpm --filter weapp-tailwindcss bench:js-diff -- --glob="packages/weapp-tailwindcss/test/fixtures/js/**/*.js"
import type { IJsHandlerOptions, JsHandlerResult } from 'weapp-tailwindcss/src/types'
import { createRequire } from 'node:module'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import fg from 'fast-glob'
import fs from 'fs-extra'
import pc from 'picocolors'
import { resolveCorePackagePath } from './paths'

type EngineId = 'babel' | 'swc' | 'oxc'

interface RunOptions {
  engines: EngineId[]
  glob: string | string[]
  iter: number
  warmup: number
  save?: string
  compare?: string
}

interface PerEngineStats {
  iter: number
  samples: number[]
  median: number
  mean: number
  p95: number
}

interface PerFileResult {
  id: string
  engines: Record<string, PerEngineStats>
}

interface BenchSnapshot {
  version: 1
  meta: {
    date: string
    commit?: string
    engines: EngineId[]
    iter: number
    warmup: number
    glob: string | string[]
  }
  files: PerFileResult[]
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
  const enginesStr = get('engines', 'babel,swc,oxc')!
  const engines = enginesStr.split(',').map(s => s.trim()).filter(Boolean) as EngineId[]
  const glob = get('glob', 'packages/weapp-tailwindcss/test/fixtures/**/*.{js,jsx,ts,tsx,wxs}')!
  const iter = Number(get('iter', '8'))
  const warmup = Number(get('warmup', '1'))
  const save = get('save')
  const compare = get('compare')
  return { engines, glob, iter, warmup, save, compare }
}

function now() {
  return performance.now()
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) {
    return 0
  }
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)]
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

function useBabel() {
  const { jsHandler } = require('weapp-tailwindcss/src/js/babel') as typeof import('weapp-tailwindcss/src/js/babel')
  return jsHandler
}

function useSwc() {
  const { swcJsHandler } = require('weapp-tailwindcss/src/experimental/swc') as typeof import('weapp-tailwindcss/src/experimental/swc')
  return swcJsHandler
}

function useOxc() {
  const { oxcJsHandler } = require('weapp-tailwindcss/src/js/fast-path/oxc') as typeof import('weapp-tailwindcss/src/js/fast-path/oxc')
  return oxcJsHandler
}

function getHandler(id: EngineId) {
  if (id === 'babel') {
    return useBabel()
  }
  if (id === 'swc') {
    return useSwc()
  }
  if (id === 'oxc') {
    return useOxc()
  }
  throw new Error(`unknown engine: ${id}`)
}

function computeStats(samples: number[]): PerEngineStats {
  const sorted = [...samples].sort((a, b) => a - b)
  const sum = samples.reduce((a, b) => a + b, 0)
  const mean = samples.length > 0 ? (sum / samples.length) : 0
  return {
    iter: samples.length,
    samples,
    median: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    mean,
  }
}

async function benchPerFile(
  id: EngineId,
  files: { id: string, code: string }[],
  options: IJsHandlerOptions,
  iter: number,
  warmup: number,
) {
  const handler: (code: string, opts: IJsHandlerOptions) => JsHandlerResult = getHandler(id)
  const fallbackHandler: ((code: string, opts: IJsHandlerOptions) => JsHandlerResult) | undefined = id === 'oxc'
    ? useBabel()
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

function toSnapshot(
  engines: EngineId[],
  iter: number,
  warmup: number,
  glob: string | string[],
  files: PerFileResult[],
): BenchSnapshot {
  return {
    version: 1,
    meta: {
      date: new Date().toISOString(),
      engines,
      iter,
      warmup,
      glob,
    },
    files,
  }
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

function ratio(a: number, b: number) {
  if (b <= 0) {
    return 0
  }
  return a / b
}

function percent(deltaRatio: number) {
  return `${(deltaRatio * 100).toFixed(1)}%`
}

function compareToBabel(files: PerFileResult[]) {
  const rows: Array<{
    file: string
    swcVsBabel?: string
    oxcVsBabel?: string
  }> = []
  for (const f of files) {
    const babel = f.engines.babel?.median
    const swc = f.engines.swc?.median
    const oxc = f.engines.oxc?.median
    rows.push({
      file: f.id,
      swcVsBabel: (typeof swc === 'number' && typeof babel === 'number') ? percent(1 - ratio(swc, babel)) : undefined,
      oxcVsBabel: (typeof oxc === 'number' && typeof babel === 'number') ? percent(1 - ratio(oxc, babel)) : undefined,
    })
  }
  return rows
}

function diffSnapshots(curr: BenchSnapshot, base: BenchSnapshot) {
  const baseMap = new Map(base.files.map(f => [f.id, f]))
  const deltas: Array<{
    file: string
    engine: string
    base: number
    curr: number
    deltaMs: number
    deltaPct: string
  }> = []
  for (const f of curr.files) {
    const old = baseMap.get(f.id)
    if (!old) {
      continue
    }
    for (const [engine, stats] of Object.entries(f.engines)) {
      const prev = old.engines[engine]
      if (!prev) {
        continue
      }
      const baseMed = prev.median
      const currMed = stats.median
      const d = currMed - baseMed
      const pct = baseMed > 0 ? (d / baseMed) : 0
      deltas.push({
        file: f.id,
        engine,
        base: baseMed,
        curr: currMed,
        deltaMs: d,
        deltaPct: percent(pct),
      })
    }
  }
  deltas.sort((a, b) => Math.abs(b.deltaMs) - Math.abs(a.deltaMs))
  return deltas
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
    catch (err: any) {
      console.log(pc.red(`${id} failed: ${err?.message ?? err}`))
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
