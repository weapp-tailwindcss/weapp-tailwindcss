import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildSummary, evaluatePerformanceGuard } from '../scripts/ci-report.mjs'
import { summarizeProcessMemory } from '../scripts/process-memory.mjs'
import { runCase } from '../scripts/run-matrix.mjs'
import { createServiceFixture, createUniServiceFixture, mpxProject, uniProject, versionFor } from './helpers/gc-service.mjs'

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), sampler: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({ ...await importOriginal(), spawn: mocks.spawn }))
vi.mock('../scripts/process-memory.mjs', async importOriginal => ({ ...await importOriginal(), createProcessMemorySampler: mocks.sampler }))
// 此处冻结样本时钟以比较诊断工作量；真实保存间隔由 watch-output 回归独立验证。
vi.mock('../../performance/demo/save-pacing.mjs', () => ({
  createSavePacer: () => ({ settled() {}, async beforeSave() {} }),
}))
const roots = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

describe('GC 诊断与原 benchmark workload 隔离', () => {
  it.each([mpxProject, uniProject].flatMap(project => ['base', 'current'].map(role => ({ project, role }))))('$project.key 的 $role 开关前后结果、RSS 与预算一致，仍为原 3 build / 3 HMR 与 rollback', async ({ project, role }) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'benchmark-gc-isolation-'))
    roots.push(root)
    const { cwd } = await (project === uniProject ? createUniServiceFixture(root) : createServiceFixture(root))
    const version = { ...versionFor(root), version: `${role}:fixture`, diagnosticIdentity: { role } }
    const sourcePath = path.join(cwd, project.sourceFile)
    const outputPath = path.join(cwd, project.outputTemplate)
    const original = '<template><view class="flex">fixture</view></template>'
    const writeFile = fs.writeFile.bind(fs)
    await writeFile(sourcePath, original, 'utf8')
    await writeFile(outputPath, original, 'utf8')
    vi.spyOn(performance, 'now').mockReturnValue(100)
    const memory = summarizeProcessMemory([100, 120].map((rssMb, index) => ({ at: 1000 + index * 250, rssMb, processCount: 1, processes: [{ pid: 123, ppid: 1, rssMb, command: 'fixture-node' }] })))
    const options = { buildRuns: 3, hmrRuns: 3, timeoutMs: 1000, pollIntervalMs: 1 }
    let watchChild
    vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      expect(pid).toBe(-watchChild.pid)
      return watchChild.kill(signal)
    })
    let sourceWrites = 0
    let mutationCount = 0
    const timing = durationMs => Buffer.from(`[weapp-tailwindcss:hmr] ${JSON.stringify({ bundler: 'webpack', phase: 'total', durationMs })}\n`)
    const sourceWriter = vi.spyOn(fs, 'writeFile').mockImplementation(async (file, text, ...args) => {
      await writeFile(file, text, ...args)
      if (file === sourcePath) {
        sourceWrites += 1
        await writeFile(outputPath, text, 'utf8')
        if (text !== original) {
          mutationCount += 1
          watchChild.stdout.emit('data', timing(20 + mutationCount))
        }
      }
    })

    function prepareRun() {
      sourceWrites = 0
      mutationCount = 0
      mocks.spawn.mockReset().mockImplementation((_command, args) => {
        const index = mocks.spawn.mock.calls.length - 1
        const child = Object.assign(new EventEmitter(), { pid: 1000 + index, exitCode: null, stdout: new EventEmitter(), stderr: new EventEmitter() })
        child.kill = vi.fn(() => {
          child.exitCode = 0
          child.emit('close', 0)
          return true
        })
        if (args[1] === project.devScript) {
          watchChild = child
          queueMicrotask(() => child.stdout.emit('data', Buffer.from('fixture-ready\n')))
        }
        else {
          queueMicrotask(() => {
            child.stdout.emit('data', timing(10 + index))
            child.exitCode = 0
            child.emit('close', 0)
          })
        }
        return child
      })
      mocks.sampler.mockReset().mockImplementation(() => ({ stop: () => memory }))
      sourceWriter.mockClear()
    }

    prepareRun()
    const disabled = await runCase(version, project, options)
    const disabledSpawns = structuredClone(mocks.spawn.mock.calls.map(([, args, config]) => ({ args, env: config.env })))
    expect(sourceWrites).toBe(6)
    prepareRun()
    const directory = path.join(root, 'diagnostics')
    const enabled = await runCase(version, project, { ...options, gcDiagnosticDir: directory })
    expect(enabled).toEqual(disabled)
    expect(sourceWrites).toBe(6)
    expect(mutationCount).toBe(3)
    expect(mocks.spawn.mock.calls.map(([, args]) => args)).toEqual(disabledSpawns.map(item => item.args))
    expect(mocks.spawn).toHaveBeenCalledTimes(4)
    expect(mocks.sampler).toHaveBeenCalledTimes(4)
    for (let index = 0; index < disabledSpawns.length; index += 1) {
      const activeEnv = { ...mocks.spawn.mock.calls[index][2].env }
      expect(activeEnv.NODE_OPTIONS).toContain('--import=file:')
      const identity = JSON.parse(activeEnv.WEAPP_TW_BENCH_GC_SESSION)
      expect(identity).toMatchObject({ kind: index < 3 ? 'build' : 'hmr', run: index < 3 ? index + 1 : 1, role, project: project.key })
      for (const key of ['NODE_OPTIONS', 'WEAPP_TW_BENCH_GC_EXPECTED_ENTRY', 'WEAPP_TW_BENCH_GC_SESSION']) {
        if (key in disabledSpawns[index].env) {
          activeEnv[key] = disabledSpawns[index].env[key]
        }
        else { delete activeEnv[key] }
      }
      expect(activeEnv).toEqual(disabledSpawns[index].env)
    }
    const manifests = await Promise.all((await fs.readdir(directory)).map(async session => JSON.parse(await fs.readFile(path.join(directory, session, 'controller.json'), 'utf8'))))
    expect(manifests).toHaveLength(4)
    expect(new Set(manifests.map(item => item.preloadSha256)).size).toBe(1)
    expect(new Set(manifests.map(item => item.pathHelperSha256)).size).toBe(1)
    const hmr = manifests.find(item => item.identity.kind === 'hmr')
    expect(hmr.boundaries.map(item => [item.type, item.round])).toEqual([
      ['spawn', undefined],
      ['watch-ready', undefined],
      ...[1, 2, 3].flatMap(round => ['mutation-write', 'mutation-observed', 'rollback-write', 'rollback-observed'].map(type => [type, round])),
    ])
    expect(hmr).toMatchObject({ missingPreloadEvidence: true, controller: { rootPid: 1003, timeOrigin: performance.timeOrigin } })
    const baseline = { ...disabled, version: 'base' }
    const withoutDiagnostics = buildSummary({ rows: [baseline, disabled] }, 'base', disabled.version)
    const withDiagnostics = buildSummary({ rows: [baseline, enabled] }, 'base', enabled.version)
    expect(withDiagnostics).toEqual(withoutDiagnostics)
    expect(evaluatePerformanceGuard(withDiagnostics)).toEqual(evaluatePerformanceGuard(withoutDiagnostics))
    expect(await fs.readFile(sourcePath, 'utf8')).toBe(original)
  })
})
