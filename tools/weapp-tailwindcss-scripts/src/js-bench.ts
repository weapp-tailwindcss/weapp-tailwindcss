/* empty */
// Micro benchmark for JS handlers: Babel vs SWC vs OXC POCs.
// Usage:
//   pnpm --filter weapp-tailwindcss bench:js-handlers
//   pnpm --filter weapp-tailwindcss bench:js-handlers -- --engines=babel,swc,oxc --iter=5 --warmup=1
//   pnpm --filter weapp-tailwindcss bench:js-handlers -- --glob="packages/weapp-tailwindcss/test/fixtures/jsx/**/*.js"
//
// Notes:
// - SWC requires @swc/core.
// - OXC uses the experimental JS fast path when oxc-parser is available.
// - We focus on transform hot-path. For fairness and determinism, we run with:
//   { alwaysEscape: true, needEscaped: true, generateMap: false }
//   so the handlers do roughly the same amount of work regardless of classNameSet.
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

type EngineId = 'babel' | 'swc' | 'oxc'

interface RunOptions {
  engines: EngineId[]
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
  const enginesStr = get('engines', 'babel,swc,oxc')!
  const engines = enginesStr.split(',').map(s => s.trim()).filter(Boolean) as EngineId[]
  const glob = get('glob', 'packages/weapp-tailwindcss/test/fixtures/**/*.{js,jsx,ts,tsx,wxs}')!
  const iter = Number(get('iter', '5'))
  const warmup = Number(get('warmup', '1'))
  return { engines, glob, iter, warmup }
}

function now() {
  return performance.now()
}

function toFixed2(n: number) {
  return Number.isFinite(n) ? n.toFixed(2) : String(n)
}

function percentile(sorted: number[], p: number) {
  if (sorted.length === 0) {
    return 0
  }
  const idx = Math.ceil((p / 100) * sorted.length) - 1
  return sorted[Math.min(Math.max(idx, 0), sorted.length - 1)]
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
    // Ensure the three engines do comparable work
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

function useBabel() {
  // Import the Babel implementation

  const { jsHandler } = require('weapp-tailwindcss/src/js/babel') as typeof import('weapp-tailwindcss/src/js/babel')
  return jsHandler
}

function useSwc() {
  const { swcJsHandler } = require('weapp-tailwindcss/src/experimental/swc') as typeof import('weapp-tailwindcss/src/experimental/swc')
  return swcJsHandler
}

function useOxc() {
  return import('weapp-tailwindcss/src/js/fast-path/oxc').then(({ oxcJsHandler }) => oxcJsHandler)
}

async function runEngine(
  id: EngineId,
  files: { id: string, code: string }[],
  options: IJsHandlerOptions,
  iter: number,
  warmup: number,
) {
  let handler: (code: string, opts: IJsHandlerOptions) => JsHandlerResult | undefined
  let fallbackHandler: ((code: string, opts: IJsHandlerOptions) => JsHandlerResult) | undefined
  if (id === 'babel') {
    handler = useBabel()
  }
  else if (id === 'swc') {
    handler = useSwc()
  }
  else if (id === 'oxc') {
    handler = await useOxc()
    fallbackHandler = useBabel()
  }
  else {
    throw new Error(`unknown engine: ${id}`)
  }

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
    catch (err: any) {
      console.log(pc.red(`${id} failed: ${err?.message ?? err}`))
      console.log('')
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
