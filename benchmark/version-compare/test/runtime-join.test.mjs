import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { benchmarkProjects } from '../scripts/projects.mjs'
import { verifyRuntimeBinding } from '../scripts/runtime-diagnostics/binding.mjs'
import { digestBytes } from '../scripts/runtime-diagnostics/bounded-file.mjs'
import { expectedRuntimePhases, runtimeProject } from '../scripts/runtime-diagnostics/request.mjs'
import { verifyRuntimeEvidence } from '../scripts/runtime-diagnostics/verify.mjs'
import { acceptRuntimeEvidence } from '../scripts/source-diagnostics/join-runtime.mjs'
import { makeFixtureRuntimeBinding } from './fixtures/runtime-diagnostics-contract.mjs'

vi.mock('../scripts/runtime-diagnostics/verify.mjs', () => ({
  verifyRuntimeEvidence: vi.fn(),
}))
const roots = []
const project = benchmarkProjects.find(item => item.key === runtimeProject)
const saveJson = (file, value) => fs.writeFile(file, `${JSON.stringify(value)}\n`)
afterEach(async () => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  await Promise.all(roots.splice(0).map(root => fs.rm(root, {
    recursive: true,
    force: true,
  })))
})

/** 只隔离 join 契约；profile verifier 与 PID 探针为显式 mock，RSS 是合成数据，不代表真实产品验收。 */
async function fixture() {
  const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-join-fixture-')))
  roots.push(root)
  const runtimeDirectory = path.join(root, 'runtime')
  await fs.mkdir(runtimeDirectory)
  const expectedVersions = []
  const rows = []
  const sessions = []
  const verifiedByDirectory = new Map()
  for (const [index, role] of ['base', 'current'].entries()) {
    const productRoot = path.join(root, role)
    const sourcePath = path.resolve(productRoot, project.project, project.sourceFile)
    const entry = path.join(productRoot, 'node_modules', 'weapp-vite', 'bin', 'weapp-vite.mjs')
    const manifestPath = path.join(productRoot, 'node_modules', 'weapp-vite', 'package.json')
    await fs.mkdir(path.dirname(sourcePath), {
      recursive: true,
    })
    await fs.mkdir(path.dirname(entry), {
      recursive: true,
    })
    const original = '<view class="text-red-500">original</view>\n'
    await fs.writeFile(sourcePath, original)
    await fs.writeFile(entry, 'export {}\n')
    await saveJson(manifestPath, {
      name: 'weapp-vite',
      version: '0.0.0-fixture',
      bin: {
        'weapp-vite': 'bin/weapp-vite.mjs',
      },
    })
    await fs.writeFile(path.join(productRoot, 'pnpm-lock.yaml'), 'lockfileVersion: \'9.0\'\n')
    const sourceCommit = (role === 'base' ? 'a' : 'b').repeat(40)
    const binding = makeFixtureRuntimeBinding(productRoot, [entry, manifestPath], sourceCommit)
    const expected = {
      version: role,
      root: productRoot,
      diagnosticIdentity: {
        role,
        sourceCommit,
        sourceTree: binding.product.sourceTree,
        sourceWorkingTreeStatus: '',
        binding,
      },
    }
    expectedVersions.push(expected)
    const directory = path.join(runtimeDirectory, `${role}-session`)
    await fs.mkdir(directory)
    const rootPid = 700100 + index * 10
    const workerPid = rootPid + 2
    const startedAtEpochMs = Date.now()
    const identity = {
      ...expected.diagnosticIdentity,
      role,
      version: role,
      project: runtimeProject,
      kind: 'hmr',
      run: 1,
      root: productRoot,
      sessionDirectory: directory,
      expectedEntry: entry,
      manifestPath,
      diagnosticOnly: true,
      budgetAcceptance: false,
    }
    const bindingReceipt = verifyRuntimeBinding(binding, {
      root: productRoot,
      sourceCommit,
      expectedEntry: entry,
      manifestPath,
    })
    identity.bindingReceipt = bindingReceipt
    const verification = {
      pid: workerPid,
      profiles: expectedRuntimePhases().map(([type, round], offset) => ({
        file: `profile-${offset + 1}.json.gz`,
        phase: {
          type,
          round,
          sequence: offset + 1,
        },
      })),
      bindingReceipt,
      diagnosticOnly: true,
      budgetAcceptance: false,
    }
    verifiedByDirectory.set(directory, verification)
    const initial = {
      type: 'initial',
      sourcePath,
      bytes: Buffer.byteLength(original),
      sha256: digestBytes(original),
    }
    const sourceWrites = [initial]
    for (let round = 1; round <= 3; round++) {
      const marker = `twbenchdiagnosticround${round}`
      sourceWrites.push({
        ...initial,
        type: 'mutation-written',
        marker,
        bytes: Buffer.byteLength(`${original}${marker}`),
        sha256: digestBytes(`${original}${marker}`),
      }, {
        ...initial,
        type: 'rollback-written',
        marker,
      }, {
        ...initial,
        type: 'rollback-observed',
        marker,
      })
    }
    const logReceipts = {}
    for (const name of ['stdout', 'stderr']) {
      const bytes = Buffer.from(`fixture-${name}\n`)
      await fs.writeFile(path.join(directory, `worker-${name}.log`), bytes)
      logReceipts[name] = {
        file: `worker-${name}.log`,
        bytes: bytes.length,
        observedBytes: bytes.length,
        sha256: digestBytes(bytes),
        complete: true,
      }
    }
    const controller = {
      identity,
      rootPid,
      attached: true,
      closed: true,
      processResult: {
        code: 0,
        signal: null,
      },
      checkpoints: expectedRuntimePhases().map(([type, round], offset) => ({
        type,
        round,
        sequence: offset + 1,
      })),
      sourceWrites,
      logReceipts,
      verification,
      diagnosticFailures: [],
      diagnosticOnly: true,
      budgetAcceptance: false,
    }
    const controllerFile = path.join(directory, 'controller.json')
    await saveJson(controllerFile, controller)
    await saveJson(path.join(directory, 'process-start.json'), {
      pid: workerPid,
      atEpochMs: startedAtEpochMs,
    })
    const memory = () => ({
      count: 1,
      baselineRssMb: 9,
      peakRssMb: 9,
      steadyRssMb: 9,
      steadyGrowthPct: 0,
      samples: [{
        at: startedAtEpochMs + 10,
        rssMb: 9,
        processCount: 3,
        processes: [{
          pid: rootPid,
          ppid: 1,
          rssMb: 3,
          command: 'fixture-wrapper',
        }, {
          pid: rootPid + 1,
          ppid: rootPid,
          rssMb: 2,
          command: 'fixture-shell',
        }, {
          pid: workerPid,
          ppid: rootPid + 1,
          rssMb: 4,
          command: 'fixture-worker',
        }],
      }],
    })
    rows.push({
      ...project,
      version: role,
      root: productRoot,
      buildMode: 'build',
      hmrMode: 'watch',
      buildMs: [1, 2, 3],
      hmrMs: [1, 2, 3],
      buildMemorySamples: [1, 2, 3].map(run => ({
        run,
        rootPid,
        durationMs: run,
        memory: memory(),
      })),
      hmrMemory: memory(),
    })
    sessions.push({
      directory,
      controller,
      controllerFile,
      sourcePath,
      workerPid,
    })
  }
  vi.mocked(verifyRuntimeEvidence).mockImplementation(async directory => verifiedByDirectory.get(directory))
  vi.spyOn(process, 'kill').mockImplementation(() => {
    throw Object.assign(new Error('fixture-absent'), {
      code: 'ESRCH',
    })
  })
  const report = {
    diagnosticOnly: true,
    budgetAcceptance: false,
    options: {
      buildRuns: 3,
      hmrRuns: 3,
    },
    selectedProjectKeys: [runtimeProject],
    versions: expectedVersions,
    rows,
  }
  return {
    report,
    expectedVersions,
    runtimeDirectory,
    sessions,
  }
}
describe('runtime 证据合取契约（mock profile/PID，仅验证 join）', () => {
  it('合取两侧 matrix/controller/profile、真实 PID 关联字段及原文恢复', async () => {
    const input = await fixture()
    const result = await acceptRuntimeEvidence(input)
    expect(result).toMatchObject({
      status: 'complete',
      runtimeEvidenceVerified: true,
      diagnosticOnly: true,
      budgetAcceptance: false,
      profilesPerSide: 8,
    })
    expect(result.matrix.runtimeEvidenceVerified).toBe(false)
    expect(result.roles).toHaveLength(2)
    expect(result.roles[0]).toMatchObject({
      rss: {
        workerObservedSampleCount: 1,
      },
      source: {
        restored: true,
        rounds: 3,
      },
      workerExit: {
        absent: true,
      },
    })
    expect(process.kill).toHaveBeenCalledWith(input.sessions[0].workerPid, 0)
  })
  it.each(['missing-worker', 'unrelated-worker'])('拒绝 %s 的 HMR RSS', async (mode) => {
    const input = await fixture()
    const worker = input.report.rows[0].hmrMemory.samples[0].processes[2]
    if (mode === 'missing-worker') {
      worker.pid += 100
    }
    else {
      worker.ppid = 1
    }
    await expect(acceptRuntimeEvidence(input)).rejects.toThrow('RSS 未观察到真实 worker')
  })
  it('拒绝最终源码未恢复，即使 matrix 与 profile 均通过', async () => {
    const input = await fixture()
    await fs.appendFile(input.sessions[0].sourcePath, 'changed')
    await expect(acceptRuntimeEvidence(input)).rejects.toThrow('最终来源未恢复')
  })
  it.each(['closed', 'firstFailure', 'rollback', 'log'])('拒绝 controller %s 缺证', async (mode) => {
    const input = await fixture()
    const {
      controller,
      controllerFile,
    } = input.sessions[0]
    if (mode === 'closed') {
      controller.closed = false
    }
    else if (mode === 'firstFailure') {
      controller.firstFailure = {
        message: 'fixture-first-failure',
      }
    }
    else if (mode === 'rollback') {
      controller.sourceWrites[3].sha256 = 'f'.repeat(64)
    }
    else {
      controller.logReceipts.stdout.complete = false
    }
    await saveJson(controllerFile, controller)
    await expect(acceptRuntimeEvidence(input)).rejects.toThrow()
  })
  it('拒绝额外 session，不用目录名猜测或选取旧报告', async () => {
    const input = await fixture()
    await fs.mkdir(path.join(input.runtimeDirectory, 'extra-session'))
    await expect(acceptRuntimeEvidence(input)).rejects.toThrow('恰有两个')
  })
  it('保留底层 profile 首败', async () => {
    const input = await fixture()
    vi.mocked(verifyRuntimeEvidence).mockRejectedValueOnce(new Error('fixture-profile-first-failure'))
    await expect(acceptRuntimeEvidence(input)).rejects.toThrow('fixture-profile-first-failure')
  })
  it.each(['alive', 'EPERM'])('worker PID %s 时拒绝关闭成功', async (mode) => {
    const input = await fixture()
    vi.mocked(process.kill).mockImplementation(() => {
      if (mode === 'EPERM') {
        throw Object.assign(new Error('fixture-denied'), {
          code: 'EPERM',
        })
      }
      return true
    })
    await expect(acceptRuntimeEvidence(input)).rejects.toThrow(mode === 'alive' ? 'PID 仍存在' : '退出未确认')
  })
})
