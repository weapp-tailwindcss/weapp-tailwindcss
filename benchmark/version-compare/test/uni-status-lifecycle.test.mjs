import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { createCaseDiagnostics } from '../scripts/diagnostics/controller.mjs'
import { isOperationEvidenceFilename } from '../scripts/diagnostics/evidence.mjs'
import { verifyUniInputEvidence } from '../scripts/diagnostics/uni-evidence.mjs'
import { createUniServiceFixture, uniProject, versionFor } from './helpers/gc-service.mjs'
import { uniWorkerFixture } from './helpers/uni-worker.mjs'
import { viteOperationFixture } from './helpers/vite-operations.mjs'

const roots = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })

function message(child, expected) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`worker未返回${expected}`)), 10000)
    const onMessage = value => { if (value === expected) finish() }
    const onClose = () => finish(new Error(`worker在${expected}之前退出`))
    function finish(error) {
      clearTimeout(timer)
      child.off('message', onMessage)
      child.off('close', onClose)
      if (error) reject(error)
      else resolve()
    }
    child.on('message', onMessage)
    child.once('close', onClose)
  })
}

it('真实worker capture期间不伪造closed，bundle真实终结即刷新；SIGKILL不留下旧closed=false或旧字节状态', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'uni-status-lifecycle-'))
  roots.push(root)
  const source = `import fs from 'node:fs'; import path from 'node:path';
const observer = globalThis[Symbol.for(${JSON.stringify(diagnosticSymbol)})];
const key = path.join(JSON.parse(process.env.WEAPP_TW_BENCH_ALLOCATION_SESSION).root, 'input.vue');
const store = { snapshot: () => ({ sourceById: [[key, 'flex']], candidatesById: [[key, ['flex']]], inlineIncludedCandidates: [], inlineExcludedCandidates: [] }), values: () => new Set(['flex']), getRevision: () => 1 };
observer.registerStore(store);
${uniWorkerFixture()}
${viteOperationFixture()}
let unblock; const wait = new Promise(resolve => { unblock = resolve });
process.on('message', value => { if (value === 'settle') unblock() });
await diagnosticBundle('flex', async () => {
  await diagnosticGenerate();
  await diagnosticCompilation({ sourceCandidates: store.values(), runtime: store.values(), transformRuntime: store.values(), generatorRuntime: store.values() });
  process.send('captured'); await wait;
});
process.send('settled'); setInterval(() => {}, 1000);
`
  const { cwd, entry } = await createUniServiceFixture(root, source)
  await fs.writeFile(path.join(cwd, uniProject.sourceFile), 'flex')
  const diagnostics = await createCaseDiagnostics({ allocation: 'inputs', cwd, versionMeta: versionFor(root), projectMeta: uniProject, directory: path.join(root, 'evidence'), kind: 'build', run: 1 })
  const child = spawn(process.execPath, [entry], { cwd, env: { ...process.env, ...diagnostics.env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
  diagnostics.spawned(child.pid, child)
  const closed = new Promise(resolve => child.once('close', resolve))
  const directory = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_ALLOCATION_SESSION).sessionDirectory
  const statusFile = path.join(directory, 'status.json')
  try {
    await message(child, 'captured')
    const during = JSON.parse(await fs.readFile(statusFile))
    expect(during.complete).toBe(true)
    expect(during.uniInput.bundles[0].closed).toBe(false)
    await expect(verifyUniInputEvidence(directory, during.uniInput, [])).rejects.toThrow('未完整关闭')
    const settled = message(child, 'settled')
    child.send('settle')
    await settled
    const finalBytes = await fs.readFile(statusFile)
    const final = JSON.parse(finalBytes)
    expect(final.uniInput.bundles[0].closed).toBe(true)
    expect(final.operations.events).toBe(during.operations.events + 1)
    const files = (await fs.readdir(directory)).filter(isOperationEvidenceFilename)
    const sizes = await Promise.all(files.map(file => fs.stat(path.join(directory, file)).then(stat => stat.size)))
    expect(final.bytesWritten).toBe(sizes.reduce((a, b) => a + b, 0))
    expect(final.filesWritten).toBe(files.length)
    child.kill('SIGKILL')
    await closed
    expect(await fs.readFile(statusFile)).toEqual(finalBytes)
    await diagnostics.finish({ failed: true, error: new Error('fixture intentionally force-killed after actual bundle end') })
    const output = JSON.parse(await fs.readFile(path.join(directory, 'worker-result.json')))
    expect(output.operationAccounting).toMatchObject({ actualBytes: final.bytesWritten, statusBytes: final.bytesWritten, consistent: true })
    expect(output.processResult.signal).toBe('SIGKILL')
  }
  finally {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
    await closed
  }
}, 20000)
