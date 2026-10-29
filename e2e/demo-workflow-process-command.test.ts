import type { ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanupFixture } from '../packages/weapp-tailwindcss/test/fixtures/watch-session-process/cleanup.mts'
import { createProcessCommandOwner, ProcessCommandCleanupError, runProcessCommand } from '../scripts/demo-e2e-workflow/process-command'

const state = vi.hoisted(() => ({ synthetic: false, calls: 0, child: undefined as ChildProcess | undefined, callback: undefined as ((error: Error | null, stdout: string, stderr: string) => void) | undefined }))
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, execFile: (...args: Parameters<typeof actual.execFile>) => {
    state.calls += 1
    if (!state.synthetic) {
      state.child = actual.execFile(...args)
      return state.child
    }
    state.callback = args.at(-1) as typeof state.callback
    return state.child
  } }
})
afterEach(() => {
  vi.useRealTimers()
  state.synthetic = false
  state.calls = 0
  state.callback = undefined
  state.child = undefined
})

function syntheticChild(pid = 424242) {
  state.synthetic = true
  state.child = Object.assign(new EventEmitter(), { pid, kill: vi.fn(() => true) }) as unknown as ChildProcess
  return state.child
}

it('Abort 错误回调先到仍等待探针 close 后才拒绝', async () => {
  state.synthetic = true
  state.child = Object.assign(new EventEmitter(), { kill: vi.fn() }) as unknown as ChildProcess
  const aborted = new Error('aborted')
  let settled = false
  const task = runProcessCommand('ps', [], 500).catch(error => error).finally(() => {
    settled = true
  })
  state.callback!(aborted, '')
  await Promise.resolve()
  expect(settled).toBe(false)
  state.child.emit('close', null, 'SIGKILL')
  expect(await task).toBe(aborted)
})

it('真实探针超时后已等待本轮进程退出，不留下后台进程', async () => {
  const owner = createProcessCommandOwner()
  await expect(runProcessCommand(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], 80, undefined, { owner })).rejects.toThrow()
  expect(state.child?.exitCode !== null || state.child?.signalCode !== null).toBe(true)
  expect(() => process.kill(state.child!.pid!, 0)).toThrow()
  expect(owner.diagnostics()).toMatchObject({ cleanupVerified: true, probes: [{ handleRetained: false }] })
  await owner.close()
})

it('预算耗尽不启动探针', async () => {
  await expect(runProcessCommand('ps', [], 0)).rejects.toThrow('禁止继续调度')
  expect(state.child).toBeUndefined()
})

it('调用方确认合法失败时接受空输出', async () => {
  state.synthetic = true
  state.child = Object.assign(new EventEmitter(), { kill: vi.fn() }) as unknown as ChildProcess
  const noMatch = Object.assign(new Error('ps exited'), { code: 1 })
  const task = runProcessCommand('ps', [], 500, undefined, {
    acceptFailure: (error, stdout, stderr) => error === noMatch && stdout === '' && stderr === '',
  })
  state.callback!(noMatch, '', '')
  state.child.emit('close', null, null)
  await expect(task).resolves.toBe('')
})

it('合法失败判定必须拒绝带错误输出的退出码', async () => {
  state.synthetic = true
  state.child = Object.assign(new EventEmitter(), { kill: vi.fn() }) as unknown as ChildProcess
  const invalidQuery = Object.assign(new Error('ps exited'), { code: 1 })
  const task = runProcessCommand('ps', [], 500, undefined, {
    acceptFailure: (error, stdout, stderr) => error === invalidQuery && stdout === '' && stderr === '',
  })
  state.callback!(invalidQuery, '', 'ps: invalid option')
  state.child.emit('close', null, null)
  await expect(task).rejects.toBe(invalidQuery)
})

it('超时后缺少 callback 与 close 仍有独立截止并记录未确认 PID', async () => {
  vi.useFakeTimers()
  state.synthetic = true
  state.child = Object.assign(new EventEmitter(), { pid: 424242, kill: vi.fn(() => true) }) as unknown as ChildProcess
  let result: unknown
  const task = runProcessCommand('ps', [], 80).catch((error) => {
    result = error
  })
  await vi.advanceTimersByTimeAsync(80)
  expect(state.child.kill).toHaveBeenCalledWith('SIGKILL')
  expect(result).toBeUndefined()
  await vi.advanceTimersByTimeAsync(1000)
  expect(result).toBeInstanceOf(Error)
  expect((result as Error).message).toContain('pid=424242')
  expect((result as Error).message).toContain('退出未确认')
  await task
})

it('未确认回收时原域持有句柄并禁止新探针，其他域仍可并发完成', async () => {
  vi.useFakeTimers()
  const owner = createProcessCommandOwner()
  const first = syntheticChild()
  const failed = runProcessCommand('ps', ['-p', '1'], 80, undefined, { owner }).catch(error => error)
  const firstCallback = state.callback!
  const independentOwner = createProcessCommandOwner()
  const second = syntheticChild(424243)
  const independent = runProcessCommand('ps', [], 5000, undefined, { owner: independentOwner })
  const secondCallback = state.callback!
  await vi.advanceTimersByTimeAsync(1080)
  const error = await failed
  expect(error).toBeInstanceOf(ProcessCommandCleanupError)
  expect(owner.diagnostics()).toMatchObject({ cleanupVerified: false, probes: [{ pid: 424242, handleRetained: true, terminationResult: true, reapTimedOutAt: expect.any(Number) }] })
  expect(JSON.parse(JSON.stringify(error))).toMatchObject({ receipt: { pid: 424242, initialFailure: expect.stringContaining('超时') } })
  const calls = state.calls
  await expect(runProcessCommand('ps', [], 80, undefined, { owner })).rejects.toBe(error)
  expect(state.calls).toBe(calls)
  expect(() => owner.assertHealthy()).toThrow(error)
  secondCallback(null, 'independent', '')
  second.emit('close', 0, null)
  await expect(independent).resolves.toBe('independent')
  await independentOwner.close()
  expect(independentOwner.diagnostics().probes[0].handleRetained).toBe(false)
  firstCallback(null, '', '')
  first.emit('exit', null, 'SIGKILL')
  expect(owner.diagnostics().cleanupVerified).toBe(false)
  expect(error.receipt.handleRetained).toBe(true)
  expect(error.receipt.closedAt).toBeUndefined()
  first.emit('close', null, 'SIGKILL')
  expect(owner.diagnostics().cleanupVerified).toBe(true)
  expect(error.receipt.handleRetained).toBe(false)
  expect(error.receipt.closedAt).toEqual(expect.any(Number))
  await expect(owner.close()).rejects.toBe(error)
  await expect(failed).resolves.toBe(error)
  await expect(runProcessCommand('ps', [], 80, undefined, { owner })).rejects.toBe(error)
  expect(state.calls).toBe(calls)
})

it.each(['throws', 'false'] as const)('终止请求%s仍保留首错与原句柄回执', async (mode) => {
  vi.useFakeTimers()
  const owner = createProcessCommandOwner()
  const child = syntheticChild()
  vi.mocked(child.kill).mockImplementation(() => {
    if (mode === 'throws') {
      throw new Error('injected kill failure')
    }
    return false
  })
  const failed = runProcessCommand('ps', [], 80, undefined, { owner }).catch(error => error)
  await vi.advanceTimersByTimeAsync(1080)
  const error = await failed
  expect(error.receipt).toMatchObject({ pid: child.pid, initialFailure: expect.stringContaining('超时') })
  if (mode === 'throws') {
    expect(error.receipt.terminationError).toContain('injected kill failure')
    expect(error.cause.errors[0].message).toContain('超时')
  }
  else {
    expect(error.receipt.terminationResult).toBe(false)
  }
  expect(child.kill).toHaveBeenCalledTimes(1)
  state.callback!(new Error('late callback'), '', '')
  child.emit('close', null, 'SIGKILL')
  await expect(owner.close()).rejects.toBe(error)
})

it('关闭归属域幂等且不重新领取执行或回收预算', async () => {
  vi.useFakeTimers()
  const owner = createProcessCommandOwner()
  const child = syntheticChild()
  const failed = runProcessCommand('ps', [], 80, undefined, { owner }).catch(error => error)
  await vi.advanceTimersByTimeAsync(40)
  const closing = owner.close()
  const closeResult = closing.catch(error => error)
  expect(owner.close()).toBe(closing)
  await expect(runProcessCommand('ps', [], 80, undefined, { owner })).rejects.toThrow('归属域已关闭')
  expect(state.calls).toBe(1)
  await vi.advanceTimersByTimeAsync(1039)
  expect(owner.diagnostics().probes[0].settledAt).toBeUndefined()
  await vi.advanceTimersByTimeAsync(1)
  const error = await failed
  expect(await closeResult).toBe(error)
  expect(child.kill).toHaveBeenCalledTimes(1)
  expect(error.receipt.reapDeadlineAt - error.receipt.executionDeadlineAt).toBe(1000)
  state.callback!(null, '', '')
  child.emit('close', null, 'SIGKILL')
  expect(owner.close()).toBe(closing)
})

it('close 已确认但 callback 缺失仍保留执行失败，回收状态不代表任务成功', async () => {
  vi.useFakeTimers()
  const owner = createProcessCommandOwner()
  const child = syntheticChild()
  const failed = runProcessCommand('ps', [], 80, undefined, { owner }).catch(error => error)
  child.emit('close', 0, null)
  await vi.advanceTimersByTimeAsync(1080)
  const error = await failed
  expect(error).toBeInstanceOf(ProcessCommandCleanupError)
  expect(owner.diagnostics().cleanupVerified).toBe(true)
  expect(error.receipt.handleRetained).toBe(true)
  expect(error.receipt.callbackAt).toBeUndefined()
  expect(child.kill).not.toHaveBeenCalled()
  await expect(owner.close()).rejects.toBe(error)
  state.callback!(null, '', '')
  expect(error.receipt.handleRetained).toBe(false)
  await expect(failed).resolves.toBe(error)
})

it('探针域失效仍请求 UUID 自退，业务清理不把查询失败当空集', async () => {
  vi.useFakeTimers()
  const owner = createProcessCommandOwner()
  const child = syntheticChild()
  const failed = runProcessCommand('ps', [], 80, undefined, { owner }).catch(error => error)
  await vi.advanceTimersByTimeAsync(1080)
  await failed
  const directory = await mkdtemp(path.join(os.tmpdir(), 'watch-owner-cleanup-'))
  try {
    for (const [index, name] of ['spawned', 'root', 'worker'].entries()) {
      await writeFile(path.join(directory, `${name}.json`), JSON.stringify({ token: 'owned', pid: 100 + index }))
    }
    await writeFile(path.join(directory, 'manifest.json'), JSON.stringify({ token: 'owned', registered: [] }))
    const cleanup = await cleanupFixture(directory, 'owned', true, undefined, owner)
    expect(await readFile(path.join(directory, 'cleanup'), 'utf8')).toBe('owned')
    expect(cleanup.verified).toBe(false)
    expect(cleanup.errors.join()).toContain('退出未确认')
    expect(owner.diagnostics().cleanupVerified).toBe(false)
    expect(state.calls).toBe(1)
  }
  finally {
    state.callback!(null, '', '')
    child.emit('close', null, 'SIGKILL')
    await rm(directory, { recursive: true, force: true })
  }
})
