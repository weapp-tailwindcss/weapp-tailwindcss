import { allCases, resolveArgs } from '../src/cases'
import { loadSubject, type SubjectId } from '../src/subjects'
import type { CaseBench } from '../src/results'
import { summarizeLatency } from '../src/stats'

export type { CaseBench }

const WARMUP = 300
const STEADY_SAMPLES = 400
const BATCH = 25
const MEMORY_ITERS = 8000

function parseSubject(): SubjectId {
  const raw = process.argv.find(arg => arg.startsWith('--subject='))?.slice('--subject='.length)
  if (!raw) {
    throw new Error('missing --subject')
  }
  return raw as SubjectId
}

function nowNs() {
  return Number(process.hrtime.bigint())
}

function invoke(fn: (...inputs: any[]) => string, args: unknown[]) {
  return fn(...args)
}

function collectSteady(fn: (...inputs: any[]) => string, createArgs: (index: number) => unknown[]) {
  for (let i = 0; i < WARMUP; i += 1) {
    invoke(fn, createArgs(i))
  }

  const samples: number[] = []
  let callIndex = WARMUP
  while (samples.length < STEADY_SAMPLES) {
    const start = nowNs()
    for (let i = 0; i < BATCH; i += 1) {
      invoke(fn, createArgs(callIndex))
      callIndex += 1
    }
    samples.push((nowNs() - start) / BATCH)
  }
  return summarizeLatency(samples)
}

function measureHeap(fn: (...inputs: any[]) => string, createArgs: (index: number) => unknown[]) {
  const gc = globalThis.gc
  if (typeof gc !== 'function') {
    return null
  }
  gc()
  const before = process.memoryUsage().heapUsed
  for (let i = 0; i < MEMORY_ITERS; i += 1) {
    invoke(fn, createArgs(i + 10_000))
  }
  gc()
  return process.memoryUsage().heapUsed - before
}

const subjectId = parseSubject()
const fn = await loadSubject(subjectId)
const cases: CaseBench[] = []

for (const benchCase of allCases) {
  const firstArgs = resolveArgs(benchCase, 0)
  const coldStart = nowNs()
  invoke(fn, firstArgs)
  const coldStartNs = nowNs() - coldStart

  const createArgs = benchCase.kind === 'static'
    ? () => benchCase.args
    : (index: number) => benchCase.createArgs(index)

  const steady = collectSteady(fn, createArgs)
  const heapDeltaBytes = ['cache-hit', 'cache-miss', 'long-list', 'working-set'].includes(benchCase.id)
    ? measureHeap(fn, createArgs)
    : null

  cases.push({
    id: benchCase.id,
    title: benchCase.title,
    conflict: benchCase.conflict,
    coldStartNs,
    steady,
    heapDeltaBytes,
  })
}

process.stdout.write(`${JSON.stringify({ subjectId, cases })}\n`)
