import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { afterEach, expect, it } from 'vitest'
import { runWithCleanup } from '../scripts/diagnostics/failures.mjs'
import { limits } from '../scripts/taro-cpu-diagnostics/identity.mjs'
import { runTaroCpuDiagnostics } from '../scripts/taro-cpu-diagnostics/run-taro-cpu.mjs'

const temporaryRoots = []
const preloadFile = fileURLToPath(new URL('../scripts/taro-cpu-diagnostics/taro-cpu-loaded-preload.cjs', import.meta.url))
const actualRunner = fileURLToPath(new URL('../../../scripts/taro-build-runner.mjs', import.meta.url))
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, {
    recursive: true,
    force: true,
  })))
})
const cliSource = String.raw`
const fs = require('node:fs')
const path = require('node:path')
const payload = require('weapp-tailwindcss')
if (payload.marker !== 'fixture' || process.env.TARO_BUILD_STRICT !== '1') throw new Error('fixture setup')
fs.appendFileSync(path.join(process.cwd(), 'runs.log'), JSON.stringify({ pid: process.pid, argv: process.argv.slice(2) }) + '\n')
const mode = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'fixture-mode.json'), 'utf8')).mode
if (mode === 'failure') { console.error('FIRST-BUSINESS-FAILURE'); process.exitCode = 23 }
else if (mode === 'timeout') { setInterval(() => {}, 1000) }
else if (mode === 'timeout-descendant' || mode === 'normal-descendant' || mode === 'failure-descendant') {
  const descendant = require('node:child_process').spawn(process.execPath, ['-e', "process.on('SIGTERM', () => {}); process.send('ready'); setInterval(() => {}, 1000)"], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] })
  descendant.once('message', () => {
    fs.writeFileSync(path.join(process.cwd(), 'descendant-pid.json'), JSON.stringify({ pid: descendant.pid }))
    descendant.disconnect()
    descendant.unref()
  })
  if (mode === 'timeout-descendant') setInterval(() => {}, 1000)
  if (mode === 'failure-descendant') process.exitCode = 23
}
else if (mode === 'log-cap') { process.stdout.write(Buffer.alloc(9 * 1024 * 1024, 65)); setInterval(() => {}, 1000) }
else {
  const end = Date.now() + 25
  let accumulator = 0
  while (Date.now() < end) accumulator += Math.random()
  console.log('fixture completed', accumulator)
}
`
async function roleFixture(parent, role, mode) {
  const root = path.join(parent, role)
  const project = path.join(root, 'demo', 'taro-webpack-react-tailwindcss-v4')
  const cli = path.join(project, 'node_modules', '@tarojs', 'cli')
  const weapp = path.join(project, 'node_modules', 'weapp-tailwindcss')
  for (const directory of [path.join(root, 'scripts'), path.join(root, 'node_modules', '.pnpm'), path.join(root, 'node_modules', '.bin'), path.join(project, 'node_modules', '.bin'), path.join(cli, 'bin'), weapp]) {
    await fs.mkdir(directory, {
      recursive: true,
    })
  }
  const runner = await fs.readFile(actualRunner)
  await fs.writeFile(path.join(root, 'scripts', 'taro-build-runner.mjs'), runner)
  const lock = Buffer.from('lockfileVersion: \'9.0\'\n')
  await fs.writeFile(path.join(root, 'pnpm-lock.yaml'), lock)
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture-root',
    private: true,
  }))
  await fs.writeFile(path.join(project, 'package.json'), JSON.stringify({
    name: 'fixture-taro',
    private: true,
  }))
  await fs.writeFile(path.join(project, 'fixture-mode.json'), JSON.stringify({
    mode,
  }))
  await fs.writeFile(path.join(cli, 'package.json'), JSON.stringify({
    name: '@tarojs/cli',
    version: '0.0.0-fixture',
    bin: {
      taro: 'bin/taro',
    },
    type: 'commonjs',
  }))
  await fs.writeFile(path.join(cli, 'bin', 'taro'), cliSource)
  await fs.writeFile(path.join(weapp, 'package.json'), JSON.stringify({
    name: 'weapp-tailwindcss',
    version: '0.0.0-fixture',
    main: 'index.cjs',
  }))
  await fs.writeFile(path.join(weapp, 'index.cjs'), 'module.exports = { marker: \'fixture\' }\n//# sourceMappingURL=missing.cjs.map\n')
  return {
    role,
    root: await fs.realpath(root),
    sourceCommit: (role === 'base' ? 'a' : 'b').repeat(40),
    lockSha256: digest(lock),
    runnerSha256: digest(runner),
  }
}
async function fixture(modes = {}) {
  const parent = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'taro-cpu-fixture-')))
  temporaryRoots.push(parent)
  const roles = []
  for (const role of ['base', 'current']) {
    roles.push(await roleFixture(parent, role, modes[role] ?? 'normal'))
  }
  return {
    parent,
    roles,
    outputDirectory: path.join(parent, 'evidence'),
    preloadFile,
    timeoutMs: 10000,
  }
}
const projectDirectory = role => path.join(role.root, 'demo', 'taro-webpack-react-tailwindcss-v4')
async function runs(role) {
  try {
    return (await fs.readFile(path.join(projectDirectory(role), 'runs.log'), 'utf8')).trim().split('\n').filter(Boolean).map(row => JSON.parse(row))
  }
  catch (error) {
    if (error.code === 'ENOENT') {
      return []
    }
    throw error
  }
}
it('复制真实 Taro runner，每侧仅执行一次并绑定实际 CPU / loaded CJS 物理身份', async () => {
  const options = await fixture()
  const report = await runTaroCpuDiagnostics(options)
  expect(report).toMatchObject({
    diagnosticOnly: true,
    budgetAcceptance: false,
    status: 'complete',
    runsPerRole: 1,
    order: ['base', 'current'],
    completedRoles: ['base', 'current'],
    unstartedRoles: [],
    processAssets: {
      window: 'unknown',
      attribution: 'unknown',
    },
  })
  for (const role of options.roles) {
    const calls = await runs(role)
    expect(calls).toHaveLength(1)
    expect(calls[0].argv).toEqual(['build', '--type', 'weapp'])
    const run = report.runs.find(run => run.role === role.role)
    expect(run.process).toMatchObject({
      pid: calls[0].pid,
      exitCode: 0,
      closeConfirmed: true,
      cleanupErrors: [],
    })
    expect(run.process.command.args).toContain('--cpu-prof')
    expect(run.process.command.args.some(arg => arg.startsWith('--cpu-prof-name='))).toBe(false)
    expect(run.cpu.main).toMatchObject({
      processId: calls[0].pid,
      threadId: 0,
      mainProcess: true,
      scope: 'whole-main-process',
      includesExitObserver: true,
      processAssets: {
        window: 'unknown',
        attribution: 'unknown',
      },
    })
    expect(run.cpu.main.bytes).toBeGreaterThan(0)
    expect(digest(await fs.readFile(run.cpu.main.physical))).toBe(run.cpu.main.sha256)
    const loaded = JSON.parse(await fs.readFile(run.loadedCjs.physical, 'utf8'))
    expect(loaded).toMatchObject({
      status: 'complete',
      incomplete: false,
      pid: calls[0].pid,
      threadId: 0,
      identity: run.identity,
      observed: {
        lock: {
          sha256AtObservation: role.lockSha256,
        },
        runner: {
          sha256AtObservation: role.runnerSha256,
        },
      },
      observer: {
        processAssets: {
          window: 'unknown',
          attribution: 'unknown',
        },
      },
    })
    const entry = loaded.loaded.find(entry => entry.name === 'weapp-tailwindcss')
    expect(entry).toMatchObject({
      evidence: 'loaded-cjs-cache',
      sourceMap: {
        status: 'unavailable',
        attribution: 'unknown',
      },
    })
    expect(entry.physicalFile).toBe(await fs.realpath(path.join(projectDirectory(role), 'node_modules', 'weapp-tailwindcss', 'index.cjs')))
    expect(entry.fileSha256AtObservation).toBe(digest(await fs.readFile(entry.physicalFile)))
  }
  const saved = JSON.parse(await fs.readFile(report.receipt.physical, 'utf8'))
  expect(saved.status).toBe('complete')
  expect(digest(await fs.readFile(report.receipt.physical))).toBe(report.receipt.sha256)
}, 30000)
it.each(['sha', 'git', 'borrowed'])('准备身份 %s 失败时不启动任何角色、不创建证据目录', async (kind) => {
  const options = await fixture()
  if (kind === 'sha') {
    options.roles[1].lockSha256 = '0'.repeat(64)
  }
  if (kind === 'git') {
    await fs.writeFile(path.join(options.roles[1].root, '.git'), 'gitdir: elsewhere')
  }
  if (kind === 'borrowed') {
    const nodeModules = path.join(options.roles[1].root, 'node_modules')
    await fs.rm(nodeModules, {
      recursive: true,
    })
    await fs.symlink(path.join(options.roles[0].root, 'node_modules'), nodeModules, process.platform === 'win32' ? 'junction' : 'dir')
  }
  await expect(runTaroCpuDiagnostics(options)).rejects.toThrow()
  expect(await runs(options.roles[0])).toEqual([])
  expect(await runs(options.roles[1])).toEqual([])
  await expect(fs.lstat(options.outputDirectory)).rejects.toMatchObject({
    code: 'ENOENT',
  })
})
it('保留业务首败与非零退出码，后续证据错误不能改写失败原因，也不启动 current', async () => {
  const options = await fixture({
    base: 'failure',
  })
  const report = await runTaroCpuDiagnostics(options)
  expect(report.status).toBe('incomplete')
  expect(report.firstFailure).toMatchObject({
    role: 'base',
    stage: 'build-exit',
  })
  expect(report.runs).toHaveLength(1)
  expect(report.runs[0].process.exitCode).toBe(23)
  expect(report.unstartedRoles).toEqual(['current'])
  expect(await runs(options.roles[1])).toEqual([])
  const loaded = JSON.parse(await fs.readFile(path.join(options.outputDirectory, 'base', 'loaded-cjs.json'), 'utf8'))
  expect(loaded.businessExitCode).toBe(23)
}, 20000)
it('超时只清理该次已派生的进程树，保留 timeout 首败和未开始角色', async () => {
  const options = await fixture({
    base: 'timeout',
  })
  const report = await runTaroCpuDiagnostics({
    ...options,
    timeoutMs: 1500,
  })
  expect(report).toMatchObject({
    status: 'incomplete',
    firstFailure: {
      role: 'base',
      stage: 'timeout',
    },
    unstartedRoles: ['current'],
  })
  expect(report.runs[0].process.closeConfirmed).toBe(true)
  expect(report.runs[0].process.cleanupErrors).toEqual([])
  expect(() => process.kill(report.runs[0].process.pid, 0)).toThrow()
  expect(await runs(options.roles[1])).toEqual([])
}, 15000)
it.skipIf(process.platform === 'win32').each(['timeout-descendant', 'normal-descendant', 'failure-descendant'])('主进程 %s 关闭后仍确认并清理忽略 SIGTERM 的同组后代', async (mode) => {
  const options = await fixture({
    base: mode,
  })
  let descendantPid
  let report
  await runWithCleanup(async () => {
    report = await runTaroCpuDiagnostics({
      ...options,
      timeoutMs: 3000,
    })
    descendantPid = JSON.parse(await fs.readFile(path.join(projectDirectory(options.roles[0]), 'descendant-pid.json'), 'utf8')).pid
    expect(report).toMatchObject({
      status: 'incomplete',
      firstFailure: {
        role: 'base',
        stage: mode === 'timeout-descendant' ? 'timeout' : mode === 'failure-descendant' ? 'build-exit' : 'cleanup-owned-group',
      },
      unstartedRoles: ['current'],
    })
    expect(report.runs[0].process).toMatchObject({
      closeConfirmed: true,
      ownedGroupCloseConfirmed: true,
      cleanupErrors: [],
    })
    if (mode === 'failure-descendant') {
      expect(report.runs[0].process.exitCode).toBe(23)
    }
    expect(() => process.kill(descendantPid, 0)).toThrow()
    expect(() => process.kill(-report.runs[0].process.pid, 0)).toThrow()
    expect(await runs(options.roles[1])).toEqual([])
  }, [async () => {
    // 即使断言失败，也仅回收本 fixture 明确创建的后代，不使用进程名批量清理。
    if (!descendantPid) {
      try {
        descendantPid = JSON.parse(await fs.readFile(path.join(projectDirectory(options.roles[0]), 'descendant-pid.json'), 'utf8')).pid
      }
      catch (error) {
        if (error.code !== 'ENOENT') {
          throw error
        }
      }
    }
    if (Number.isSafeInteger(descendantPid) && descendantPid > 0) {
      try {
        process.kill(descendantPid, 'SIGKILL')
      }
      catch (error) {
        if (error.code !== 'ESRCH') {
          throw error
        }
      }
    }
  }])
}, 15000)
it('原始日志超限明确失败并保存截断状态，不作为完整证据或预算放行', async () => {
  const options = await fixture({
    base: 'log-cap',
  })
  const report = await runTaroCpuDiagnostics(options)
  expect(report).toMatchObject({
    status: 'incomplete',
    diagnosticOnly: true,
    budgetAcceptance: false,
    firstFailure: {
      stage: 'log-limit',
    },
  })
  expect(report.runs[0].process.logs.stdout).toMatchObject({
    complete: false,
  })
  expect(report.runs[0].process.logs.stdout.bytes).toBeLessThanOrEqual(limits.logBytesPerStream)
  expect(report.runs[0].process.logs.stdout.discardedBytes).toBeGreaterThan(0)
  expect(report.unstartedRoles).toEqual(['current'])
}, 20000)
