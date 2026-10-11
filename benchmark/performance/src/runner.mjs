import process from 'node:process'
import { resultOf } from './scenarios.mjs'
import { summarize } from './stats.mjs'

export async function runScenario(testCase, warmups, runs) {
  const subject = testCase.fresh ? undefined : await testCase.create()
  const samples = []
  const memories = []
  const hashes = []
  let latest
  const execute = async () => {
    const started = performance.now()
    const before = process.memoryUsage()
    const runner = testCase.fresh ? await testCase.create() : subject
    latest = resultOf(await runner())
    const after = process.memoryUsage()
    samples.push(performance.now() - started)
    memories.push({
      rssMb: after.rss / 1024 / 1024,
      rssDeltaMb: (after.rss - before.rss) / 1024 / 1024,
      heapDeltaMb: (after.heapUsed - before.heapUsed) / 1024 / 1024,
    })
    hashes.push(latest.outputHash)
  }
  for (let index = 0; index < warmups; index += 1) {
    await execute()
  }
  const coldMs = samples[0]
  samples.length = 0
  memories.length = 0
  hashes.length = 0
  for (let index = 0; index < runs; index += 1) {
    await execute()
  }
  return {
    id: testCase.id,
    group: testCase.group,
    complexityGroup: testCase.complexityGroup ?? testCase.group,
    size: testCase.size,
    sampleCount: samples.length,
    coldMs,
    time: summarize(samples),
    memory: {
      peakRssMb: Math.max(...memories.map(item => item.rssMb)),
      peakRssDeltaMb: Math.max(...memories.map(item => item.rssDeltaMb)),
      heapDeltaMb: Math.max(...memories.map(item => item.heapDeltaMb)),
    },
    outputBytes: latest.outputBytes,
    outputHashes: [...new Set(hashes)],
  }
}
