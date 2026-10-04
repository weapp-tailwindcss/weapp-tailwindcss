import type { Measurement, Mode, Phase } from './oxc-raw-transfer/types'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { cpus, freemem, totalmem } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { createWorker } from './oxc-raw-transfer/client'
import { createInput, sha256 } from './oxc-raw-transfer/input'

const phases: Phase[] = ['cold-analysis', 'warm-analysis', 'cold-handler', 'warm-handler']
const parsed = parseArgs({
  options: {
    'root': { type: 'string' },
    'output': { type: 'string' },
    'pairs': { type: 'string', default: '20' },
    'rounds': { type: 'string', default: '3' },
    'warmups': { type: 'string', default: '5' },
    'verify-only': { type: 'boolean', default: false },
  },
})
const verifyOnly = parsed.values['verify-only']
const root = resolve(parsed.values.root ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../..'))
const pairs = verifyOnly ? 1 : Number(parsed.values.pairs)
const rounds = verifyOnly ? 1 : Number(parsed.values.rounds)
const warmups = verifyOnly ? 0 : Number(parsed.values.warmups)
assert.ok(Number.isSafeInteger(pairs) && pairs >= (verifyOnly ? 1 : 20), '--pairs must be at least 20')
assert.ok(Number.isSafeInteger(rounds) && rounds >= (verifyOnly ? 1 : 3), '--rounds must be at least 3')
assert.ok(Number.isSafeInteger(warmups) && warmups >= 0, '--warmups must be non-negative')
const output = resolve(parsed.values.output ?? join(root, '.tmp', 'oxc-raw-transfer', verifyOnly ? 'verification.json' : 'benchmark.json'))
const input = createInput()
const metadata: unknown[] = []
const samples: Array<{
  round: number
  pair: number
  phase: Phase
  order: Mode[]
  inputSha256: string
  analysisSha256: string
  outputSha256: string
  literals: number
  normal: Omit<Measurement, 'analysis' | 'code'>
  raw: Omit<Measurement, 'analysis' | 'code'>
}> = []
let sourceId = 1

function statistics(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b)
  const at = (percentile: number) => sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * percentile) - 1)]!
  return { medianMs: at(0.5), p95Ms: at(0.95), minMs: sorted[0], maxMs: sorted.at(-1) }
}

function summarize(phase: Phase, round?: number) {
  const selected = samples.filter(sample => sample.phase === phase && (round === undefined || sample.round === round))
  const normal = statistics(selected.map(sample => sample.normal.perOperationMs))
  const raw = statistics(selected.map(sample => sample.raw.perOperationMs))
  return { phase, round, pairs: selected.length, normal, raw, speedup: normal.medianMs / raw.medianMs }
}

function measurementsOnly({ analysis: _analysis, code: _code, ...measurement }: Measurement) {
  return measurement
}

async function runRound(round: number) {
  const workers = {
    normal: await createWorker(root, 'normal'),
    raw: undefined as Awaited<ReturnType<typeof createWorker>> | undefined,
  }
  let failure: unknown
  try {
    workers.raw = await createWorker(root, 'raw')
    assert.deepEqual(workers.normal.metadata.versions, workers.raw.metadata.versions)
    assert.equal(workers.normal.metadata.node, workers.raw.metadata.node)
    metadata.push({ round, normal: workers.normal.metadata, raw: workers.raw.metadata })
    for (const phase of phases) {
      for (let pair = -warmups; pair < pairs; pair++) {
        const source = input.sourceFor(sourceId++)
        assert.equal(Buffer.byteLength(source), input.utf8Bytes)
        const order: Mode[] = (pair + warmups + round) % 2 === 0 ? ['normal', 'raw'] : ['raw', 'normal']
        const measured = {} as Record<Mode, Measurement>
        for (const mode of order) {
          measured[mode] = await workers[mode]!.measure({
            phase,
            source,
            iterations: phase.startsWith('cold') ? 1 : verifyOnly ? 2 : phase === 'warm-analysis' ? 200 : 5,
          })
        }
        // 比较完整事实与最终代码；哈希只用于保存证据，不能代替逐项断言。
        assert.deepEqual(measured.raw.analysis, measured.normal.analysis)
        assert.equal(measured.raw.code, measured.normal.code)
        if (pair >= 0) {
          samples.push({
            round,
            pair,
            phase,
            order,
            inputSha256: sha256(source),
            analysisSha256: sha256(JSON.stringify(measured.raw.analysis)),
            outputSha256: sha256(measured.raw.code),
            literals: measured.raw.analysis.literals.length,
            normal: measurementsOnly(measured.normal),
            raw: measurementsOnly(measured.raw),
          })
        }
      }
    }
    process.stdout.write(`Round ${round + 1}/${rounds}: full analysis and handler output parity passed\n`)
  }
  catch (error) {
    failure = error
  }
  const closed = await Promise.allSettled([workers.normal.close(), workers.raw?.close()])
  const failures = closed.filter(result => result.status === 'rejected').map(result => result.reason)
  if (failure) {
    failures.unshift(failure)
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Benchmark or worker cleanup failed')
  }
}

async function main() {
  const startedAt = new Date().toISOString()
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  const sourcePaths = [
    ['src', 'js', 'fast-path', 'analysis.ts'],
    ['src', 'js', 'fast-path', 'oxc.ts'],
    ['src', 'js', 'oxc-parser.ts'],
    ['src', 'js', 'oxc-parser', 'loader.ts'],
  ]
  const sources = sourcePaths.map(segments => ({
    path: segments.join('/'),
    sha256: sha256(readFileSync(join(root, 'packages', 'weapp-tailwindcss', ...segments), 'utf8')),
  }))
  for (let round = 0; round < rounds; round++) {
    await runRound(round)
  }
  for (let index = 0; index < sourcePaths.length; index++) {
    const after = sha256(readFileSync(join(root, 'packages', 'weapp-tailwindcss', ...sourcePaths[index]!), 'utf8'))
    assert.equal(after, sources[index]!.sha256, 'Measured source changed while sampling')
  }
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(), revision)
  const summary = verifyOnly ? [] : phases.map(phase => summarize(phase))
  const perRound = verifyOnly ? [] : Array.from({ length: rounds }, (_, round) => phases.map(phase => summarize(phase, round))).flat()
  const report = {
    schemaVersion: 1,
    purpose: verifyOnly ? 'correctness-only' : 'full-oxc-analysis-and-handler',
    startedAt,
    finishedAt: new Date().toISOString(),
    root,
    revision,
    sources,
    environment: { node: process.version, platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model, totalMemoryBytes: totalmem(), freeMemoryBytesAfter: freemem() },
    input: { records: input.records, utf8Bytes: input.utf8Bytes, codeUnits: input.codeUnits, baseSha256: input.sha256 },
    methodology: { rounds, pairsPerPhasePerRound: pairs, warmupsPerPhase: warmups, modesRunConcurrently: false, analysisCacheMissExpectedParserCalls: 1, warmTimedExpectedParserCalls: 0, warmupExcluded: true },
    metadata,
    summary,
    perRound,
    coldAnalysisImprovesEveryRound: verifyOnly ? undefined : perRound.filter(row => row.phase === 'cold-analysis').every(row => row.speedup > 1),
    samples: verifyOnly ? samples.map(({ normal: _normal, raw: _raw, ...sample }) => sample) : samples,
    limitations: 'Measures Oxc analysis and JS handler only. Cold means source-analysis cache miss in warmed workers, not process startup. Does not establish full build or HMR speedup.',
  }
  mkdirSync(dirname(output), { recursive: true })
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify({ output, input: report.input, summary, coldAnalysisImprovesEveryRound: report.coldAnalysisImprovesEveryRound }, null, 2)}\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
