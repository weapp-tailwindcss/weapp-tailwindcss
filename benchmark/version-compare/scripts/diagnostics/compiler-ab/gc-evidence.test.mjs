import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { readGcEvidence, validateGcEvidence } from './gc-evidence.mjs'
import { sha256 } from './identity.mjs'

const execute = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const preload = path.join(here, 'gc-preload.mjs')

async function fixture(natural, check, extraSource = '') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler-ab-gc-'))
  try {
    const entry = path.join(directory, 'entry.mjs')
    const identity = {
      role: 'fixture', run: 1, kind: 'build', project: 'fixture', sessionDirectory: directory,
      expectedPreloadSha256: sha256(await fs.readFile(preload)),
      expectedPathHelperSha256: sha256(await fs.readFile(path.resolve(here, '../../gc-paths.mjs'))),
    }
    await fs.writeFile(entry, `process.stdout.write(String(process.pid));\n${extraSource}\n${natural ? `
      for (let round = 0; round < 32; round += 1) {
        let allocations = Array.from({ length: 12000 }, (_, index) => ({ index, values: Array(16).fill(index) }));
        allocations = undefined;
        await new Promise(resolve => setImmediate(resolve));
      }
      await new Promise(resolve => setImmediate(resolve));
    ` : ''}`)
    const { stdout, stderr } = await execute(process.execPath, [
      natural ? '--max-old-space-size=32' : '--max-semi-space-size=64', '--import', preload, entry,
    ], {
      env: { ...process.env, WEAPP_TW_BENCH_GC_EXPECTED_ENTRY: entry, WEAPP_TW_BENCH_GC_SESSION: JSON.stringify(identity) },
      timeout: 15000,
    })
    const pid = Number(stdout)
    const file = path.join(directory, `gc-${pid}.ndjson`)
    const options = { pid, identity, actualEntry: await fs.realpath(entry), stderr }
    const records = (await fs.readFile(file, 'utf8')).trimEnd().split('\n').map(JSON.parse)
    await check({ directory, file, records, options })
  }
  finally { await fs.rm(directory, { force: true, recursive: true }) }
}

test('真实 Node 无 GC 事件也必须有相同 session/PID 的正常结束回执', async () => {
  await fixture(false, async ({ file, records, options }) => {
    const result = readGcEvidence(file, options)
    assert.equal(result.available, true)
    assert.equal(result.events, 0)
    assert.equal(records.at(-1).type, 'process-exit')
    assert.equal(records.at(-1).counts.eventsObserved, 0)
    assert.equal(records.at(-1).complete, true)
  })
})

test('真实 Node 自然 GC 在 exit 前结算，不主动请求 GC，逐事件计数与开销一致', async () => {
  await fixture(true, async ({ records, options }) => {
    const result = validateGcEvidence(records, options)
    assert.ok(result.events > 0)
    assert.equal(result.completenessScope, 'main-process-observer-received')
    assert.equal(result.counts.eventsRecorded, result.events)
    assert.ok(result.costs.dataWrites > 1)
    assert.equal(records.at(-1).identity.expectedPreloadSha256, options.identity.expectedPreloadSha256)
  })
})

test('私有 GC preload 忽略继承 --import 的 worker thread，不争用主进程证据文件', async () => {
  await fixture(false, async ({ file, directory, options }) => {
    assert.equal(options.stderr, '')
    assert.equal(readGcEvidence(file, options).available, true)
    assert.deepEqual((await fs.readdir(directory)).filter(name => name.startsWith('gc-')), [`gc-${options.pid}.ndjson`])
  }, `
    const { Worker } = await import('node:worker_threads');
    const { once } = await import('node:events');
    await (await import('node:fs/promises')).writeFile(new URL('worker.mjs', import.meta.url), 'export const worker = true');
    const worker = new Worker(new URL('worker.mjs', import.meta.url));
    await once(worker, 'exit');
  `)
})

test('GC 缺尾、错身份、写错、截断、错误计数或中间记录全部拒绝', async () => {
  await fixture(true, async ({ records, options }) => {
    for (const mutate of [
      value => { value.pop() },
      value => { value[0].pid += 1 },
      value => { value.at(-1).pid += 1 },
      value => { value[0].identity.run += 1 },
      value => { value.at(-1).identity.run += 1 },
      value => { value[0].preloadSha256 = 'wrong' },
      value => { value[0].pathHelperMatchesController = false },
      value => { value.at(-1).complete = false },
      value => { value.at(-1).counts.eventsTruncated = 1 },
      value => { value.at(-1).counts.eventsRecorded += 1 },
      value => { value.at(-1).counts.major += 1; value.at(-1).counts.minor -= 1 },
      value => { value.at(-1).costs.bytesWritten = -1 },
      value => { value[2].counts.eventsRecorded += 1 },
      value => { value.splice(1, 0, { type: 'recording-error' }) },
      value => { value.splice(1, 0, { type: 'process-start' }) },
    ]) {
      const changed = structuredClone(records)
      mutate(changed)
      assert.throws(() => validateGcEvidence(changed, options), { code: 'ERR_COMPILER_AB_GC_UNAVAILABLE' })
    }
    assert.throws(() => validateGcEvidence(records, { ...options, stderr: '[benchmark-gc] write failed' }), { code: 'ERR_COMPILER_AB_GC_UNAVAILABLE' })
  })
})

test('缺失文件、半行和非法 JSON 都产生结构化 GC unavailable 错误', async () => {
  await fixture(false, async ({ file, directory, options }) => {
    assert.throws(() => readGcEvidence(path.join(directory, 'missing'), options), { code: 'ERR_COMPILER_AB_GC_UNAVAILABLE' })
    await fs.writeFile(file, '{"type":')
    assert.throws(() => readGcEvidence(file, options), { code: 'ERR_COMPILER_AB_GC_UNAVAILABLE' })
    await fs.writeFile(file, '{broken}\n')
    assert.throws(() => readGcEvidence(file, options), { code: 'ERR_COMPILER_AB_GC_UNAVAILABLE' })
  })
})
