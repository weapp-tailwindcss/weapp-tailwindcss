import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createWorkerEvidence } from '../scripts/diagnostics/worker-evidence.mjs'
import { runCase } from '../scripts/run-matrix.mjs'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), diagnostics: vi.fn(), sampler: vi.fn() }))
vi.mock('node:child_process', async original => ({ ...await original(), spawn: mocks.spawn }))
vi.mock('../scripts/diagnostics/controller.mjs', () => ({ createCaseDiagnostics: mocks.diagnostics }))
vi.mock('../scripts/process-memory.mjs', async original => ({ ...await original(), createProcessMemorySampler: mocks.sampler }))
const roots = []
afterEach(async () => { vi.resetAllMocks(); await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true }))) })

it.each(['build', 'hmr'])('%s首错、两路日志和finish次错均保留，HMR源码仍恢复', async (kind) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'matrix-diagnostic-failure-'))
  roots.push(root)
  const source = path.join(root, 'input.vue')
  await fs.writeFile(source, '<template>original</template>')
  const worker = createWorkerEvidence(root)
  const secondary = new Error('diagnostic status incomplete')
  const diagnostics = {
    env: {}, spawned(_pid, child) { worker.attach(child) },
    async finish(outcome) { await worker.finish(outcome, { failures: [secondary] }); throw secondary },
  }
  mocks.diagnostics.mockResolvedValue(diagnostics)
  mocks.sampler.mockReturnValue({ stop: () => ({ count: 0 }) })
  mocks.spawn.mockImplementation(() => {
    const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() })
    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from([0, 255, 13, 10]))
      child.stderr.emit('data', Buffer.from('compiler operation budget exceeded\n'))
      child.exitCode = 2
      child.emit('close', 2, null)
    })
    return child
  })
  const project = { key: 'fixture', project: '.', buildScript: 'build', devScript: 'dev', sourceFile: 'input.vue', outputTemplate: 'output.wxml', injectType: 'vue', ...(kind === 'build' ? { hmrMode: 'unsupported' } : { buildMode: 'unsupported' }) }
  const failure = await runCase({ version: 'fixture', root }, project, { buildRuns: 1, hmrRuns: 3, timeoutMs: 1000, pollIntervalMs: 1 }).catch(error => error)
  expect(failure).toBeInstanceOf(AggregateError)
  expect(failure.errors).toHaveLength(2)
  expect(failure.errors[0].message).toContain(kind === 'build' ? 'build failed code=2' : 'dev exited early code=2')
  expect(failure.errors[1]).toBe(secondary)
  expect(failure.cause).toBe(failure.errors[0])
  expect(await fs.readFile(source, 'utf8')).toBe('<template>original</template>')
  expect(await fs.readFile(path.join(root, 'worker-stdout.log'))).toEqual(Buffer.from([0, 255, 13, 10]))
  const receipt = JSON.parse(await fs.readFile(path.join(root, 'worker-result.json')))
  expect(receipt.firstFailure.message).toBe(failure.errors[0].message)
  expect(receipt.diagnosticFailures[0].message).toBe(secondary.message)
})
