import type { ChildProcess, spawn as realSpawn } from 'node:child_process'
import type { DemoE2eMemoryReport } from '../scripts/demo-e2e-memory'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runDemoE2eWorkflow } from '../scripts/demo-e2e-workflow'
import { PROCESS_OBSERVER_HOST_STARTUP_MS, PROCESS_OBSERVER_PREPARE_MS } from '../scripts/demo-e2e-workflow/process-observer/transport'

const mocks = vi.hoisted(() => ({ enter: vi.fn(), pnpm: vi.fn(), ready: vi.fn(), spawn: vi.fn(), tree: vi.fn(), writeReport: vi.fn() }))
vi.mock('node:child_process', async importOriginal => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  spawn: mocks.spawn,
}))
vi.mock('../scripts/demo-e2e-workflow/process-tree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scripts/demo-e2e-workflow/process-tree')>()
  return {
    createWorkflowProcessTree: (child: ChildProcess, closed: Promise<unknown>, options: Parameters<typeof actual.createWorkflowProcessTree>[2]) => {
      const tree = actual.createWorkflowProcessTree(child, closed, { ...options, cooperativeMs: 25 })
      mocks.tree(tree)
      return tree
    },
  }
})
vi.mock('../scripts/e2e-preflight/gate', () => ({ enterFullTestGate: mocks.enter }))
vi.mock('../scripts/demo-e2e-workflow/process-observer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scripts/demo-e2e-workflow/process-observer')>()
  const { spawn } = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    prepareWorkflowProcessObserver: async (signal?: AbortSignal) => {
      const observer = await actual.prepareWorkflowProcessObserver(signal, { spawn })
      mocks.ready()
      return observer
    },
  }
})
vi.mock('../scripts/pnpm-command.mjs', () => ({ createPnpmCommand: mocks.pnpm }))
vi.mock('../scripts/demo-e2e-memory', async importOriginal => ({
  ...await importOriginal<typeof import('../scripts/demo-e2e-memory')>(),
  sampleProcessTreeAsync: async () => undefined,
  writeDemoE2eMemoryReport: mocks.writeReport,
}))

async function until(check: () => Promise<void> | void, failure?: () => Error | undefined) {
  let error: unknown
  for (let index = 0; index < 100; index++) {
    const stopped = failure?.()
    if (stopped) {
      throw stopped
    }
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
  let createPnpmCommand: typeof import('../scripts/pnpm-command.mjs').createPnpmCommand

  beforeEach(async () => {
    vi.resetAllMocks()
    signals.clear()
    spawn = (await vi.importActual<typeof import('node:child_process')>('node:child_process')).spawn
    createPnpmCommand = (await vi.importActual<typeof import('../scripts/pnpm-command.mjs')>('../scripts/pnpm-command.mjs')).createPnpmCommand
    mocks.pnpm.mockImplementation(createPnpmCommand)
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
    const launcher = `const fs = require('node:fs'); const { spawn } = require('node:child_process'); const child = spawn(process.execPath, ['-e', ${JSON.stringify(descendant)}], { detached: true, windowsHide: true, stdio: 'ignore' }); child.unref(); fs.writeFileSync(${JSON.stringify(ids)}, JSON.stringify([process.pid, child.pid])); process.on('SIGTERM', () => process.exit(0)); setInterval(() => {}, 100)`
    // 确定性覆盖 Windows pnpm 包装入口，不能依赖执行测试时的 npm_execpath。
    mocks.pnpm.mockImplementation(args => createPnpmCommand(args, { platform: 'win32', npmExecPath: undefined }))
    let launcherError: Error | undefined
    let launcherExit: { code: number | null, signal: NodeJS.Signals | null } | undefined
    let stderr = ''
    mocks.spawn.mockImplementation((_command, _args, options) => {
      // 替换为原生 Node 后必须重新声明参数语义，不能继承 pnpm.cmd 的 shell 重解释。
      const child = spawn(process.execPath, ['-e', launcher], { ...options, shell: false, stdio: ['ignore', 'ignore', 'pipe'] })
      child.once('error', (error) => {
        launcherError = error
      })
      child.once('exit', (code, exitSignal) => {
        launcherExit = { code, signal: exitSignal }
      })
      child.stderr?.on('data', (chunk) => {
        stderr += chunk
      })
      children.push(child)
      return child
    })
    let finished = false
    let workflowResult: unknown
    const prepared = new Promise<void>((resolve) => {
      mocks.ready.mockImplementation(resolve)
    })
    const running = runDemoE2eWorkflow(['--local', '--quality']).catch(error => error).then((outcome) => {
      finished = true
      workflowResult = outcome
      return outcome
    })
    const startupFailure = () => launcherError || launcherExit || finished
      ? new Error(`取消测试子进程在就绪前结束：${JSON.stringify({ error: launcherError && String(launcherError), exit: launcherExit, workflow: finished ? String(workflowResult) : undefined, stderr })}`)
      : undefined
    let pids: number[] = []
    try {
      // 启动握手的原 2.5 秒窗口只覆盖业务启动；独立冷准备由宿主握手与真实查询各自的 15 秒截止约束。
      await Promise.race([prepared, running.then((outcome) => {
        throw new Error('取消测试在采集器准备完成前结束。', { cause: outcome })
      })])
      await until(async () => {
        pids = JSON.parse(await readFile(ids, 'utf8'))
        expect(await readFile(heartbeat, 'utf8')).not.toBe('')
      }, startupFailure)
      expect(mocks.spawn.mock.calls[0]?.[2]).toMatchObject({ shell: true })
      const tree = mocks.tree.mock.calls[0]?.[0] as ReturnType<typeof import('../scripts/demo-e2e-workflow/process-tree').createWorkflowProcessTree>
      // 文件握手仅证明已启动；取消已知进程前必须等真实身份采集登记本体和独立后代。
      await until(async () => {
        const owned = await tree.capture()
        expect(pids.every(pid => owned.has(pid)), '取消验收必须覆盖已登记的本轮进程').toBe(true)
      }, startupFailure)
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
      if (!finished) {
        signals.get('SIGTERM')?.()
      }
      await running
      for (const pid of pids.toReversed()) {
        killKnown(pid)
      }
    }
  }, PROCESS_OBSERVER_HOST_STARTUP_MS + PROCESS_OBSERVER_PREPARE_MS + 15_000)

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
