import type { ChildProcess, spawn as realSpawn } from 'node:child_process'
import type { DemoE2eMemoryReport } from '../scripts/demo-e2e-memory'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDemoE2eWorkflow } from '../scripts/demo-e2e-workflow'

const mocks = vi.hoisted(() => ({ enter: vi.fn(), spawn: vi.fn(), writeReport: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: mocks.spawn,
}))
vi.mock('../scripts/demo-e2e-workflow/process-tree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scripts/demo-e2e-workflow/process-tree')>()
  return { createWorkflowProcessTree: (child: ChildProcess, closed: Promise<unknown>) => actual.createWorkflowProcessTree(child, closed, { cooperativeMs: 25 }) }
})
vi.mock('../scripts/e2e-preflight/gate', () => ({ enterFullTestGate: mocks.enter }))
vi.mock('../scripts/demo-e2e-memory', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/demo-e2e-memory')>(),
  sampleProcessTreeAsync: async () => undefined,
  writeDemoE2eMemoryReport: mocks.writeReport,
}))

async function until(check: () => Promise<void> | void) {
  let error: unknown
  for (let index = 0; index < 100; index++) {
    try {
      await check()
      return
    }
    catch (caught) {
      error = caught
    }
    await delay(25)
  }
  throw error
}

function killKnown(pid: number | undefined) {
  if (!pid) {
    return
  }
  try {
    process.kill(pid, 'SIGKILL')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error
    }
  }
}

describe('全面工作流的取消与阶段进程所有权', () => {
  const signals = new Map<string, () => void>()
  const gate = { env: {}, check: vi.fn(), close: vi.fn() }
  const children: ChildProcess[] = []
  const roots: string[] = []
  let spawn: typeof realSpawn

  beforeEach(async () => {
    vi.resetAllMocks()
    signals.clear()
    spawn = (await vi.importActual<typeof import('node:child_process')>('node:child_process')).spawn
    const on = process.on.bind(process)
    vi.spyOn(process, 'on').mockImplementation(((event: string, listener: () => void) => {
      if (event === 'SIGINT' || event === 'SIGTERM') {
        signals.set(event, listener)
        return process
      }
      return on(event, listener)
    }) as typeof process.on)
    vi.spyOn(process, 'once').mockImplementation(((event: string, listener: () => void) => {
      if (event === 'SIGINT' || event === 'SIGTERM') {
        signals.set(event, listener)
        return process
      }
      return on(event, listener)
    }) as typeof process.once)
    vi.spyOn(process, 'removeListener').mockImplementation(((event: string) => {
      signals.delete(event)
      return process
    }) as typeof process.removeListener)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    mocks.enter.mockResolvedValue(gate)
    mocks.writeReport.mockResolvedValue({ markdownFile: 'cancel-report.md' })
  })

  afterEach(async () => {
    for (const child of children.splice(0)) {
      killKnown(child.pid)
    }
    await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
    vi.restoreAllMocks()
  })

  it.each(['SIGINT', 'SIGTERM'] as const)('%s 等待本轮父进程和独立后代退出，记录取消后停止调度', async (signal) => {
    const root = await mkdtemp(path.join(tmpdir(), 'workflow-cancel-'))
    roots.push(root)
    const ids = path.join(root, 'ids.json')
    const heartbeat = path.join(root, 'heartbeat')
    const descendant = `const fs = require('node:fs'); process.on('SIGTERM', () => {}); setInterval(() => fs.writeFileSync(${JSON.stringify(heartbeat)}, String(Date.now())), 20)`
    const launcher = `const fs = require('node:fs'); const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { detached: process.platform !== 'win32', stdio: 'ignore' }); fs.writeFileSync(${JSON.stringify(ids)}, JSON.stringify([process.pid, child.pid])); process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 100)`
    mocks.spawn.mockImplementation((_command, _args, options) => {
      const child = spawn(process.execPath, ['-e', launcher], { ...options, stdio: 'ignore' })
      children.push(child)
      return child
    })
    const running = runDemoE2eWorkflow(['--local', '--quality']).catch(error => error)
    let pids: number[] = []
    try {
      await until(async () => {
        pids = JSON.parse(await readFile(ids, 'utf8'))
        expect(await readFile(heartbeat, 'utf8')).not.toBe('')
      })
      expect(signals.get(signal), '顶层必须安装取消处理').toBeTypeOf('function')
      signals.get(signal)!()
      const result = await Promise.race([running, delay(8000, 'hung')])
      expect(result).toBeInstanceOf(Error)
      expect(String(result)).toContain(signal)
      const stopped = await readFile(heartbeat, 'utf8')
      await delay(100)
      expect(await readFile(heartbeat, 'utf8')).toBe(stopped)
      expect(mocks.spawn).toHaveBeenCalledOnce()
      expect(gate.close).toHaveBeenCalledOnce()
      const report = mocks.writeReport.mock.calls.at(-1)?.[0].report as DemoE2eMemoryReport
      expect(report.exitCode).not.toBe(0)
      expect(report.steps[0]).toMatchObject({ cancelled: signal, exitCode: signal === 'SIGINT' ? 130 : 143 })
      expect(signals.size).toBe(0)
    }
    finally {
      for (const pid of pids.toReversed()) {
        killKnown(pid)
      }
      await running
    }
  }, 15_000)

  it('阶段复查期间取消，等待复查结束后不启动子进程并释放门禁', async () => {
    let release!: () => void
    gate.check.mockReturnValue(new Promise<void>((resolve) => {
      release = resolve
    }))
    const running = runDemoE2eWorkflow(['--local', '--quality']).catch(error => error)
    try {
      await until(() => expect(gate.check).toHaveBeenCalledOnce())
      expect(signals.get('SIGTERM')).toBeTypeOf('function')
      signals.get('SIGTERM')!()
    }
    finally {
      release()
    }
    expect(await running).toBeInstanceOf(Error)
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(gate.close).toHaveBeenCalledOnce()
    expect(signals.size).toBe(0)
  })
  it.each(['check', 'close'] as const)('%s 等待中取消又失败，最终报告保留两处原因', async (phase) => {
    let reject!: (error: Error) => void
    const pending = new Promise<void>((_resolve, no) => {
      reject = no
    })
    if (phase === 'check') {
      gate.check.mockReturnValue(pending)
    }
    else {
      gate.check.mockRejectedValue(new Error('stage rejected'))
      gate.close.mockReturnValue(pending)
    }
    const running = runDemoE2eWorkflow(['--local', '--quality']).catch(error => error)
    await until(() => expect(gate[phase]).toHaveBeenCalledOnce())
    signals.get('SIGINT')!()
    signals.get('SIGTERM')!()
    reject(new Error(`${phase} late rejected`))
    const error = await running
    expect(error).toBeInstanceOf(AggregateError)
    const report = mocks.writeReport.mock.calls.at(-1)?.[0].report
    expect(report.error).toContain('SIGINT')
    expect(report.error).toContain(`${phase} late rejected`)
    expect(report.error).not.toContain('收到 SIGTERM')
    expect(mocks.spawn).not.toHaveBeenCalled()
    expect(gate.close).toHaveBeenCalledOnce()
    expect(signals.size).toBe(0)
  })
})
