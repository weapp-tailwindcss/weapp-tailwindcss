import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import process from 'node:process'
import { createInterface } from 'node:readline'
import { expect, it } from 'vitest'
import { parseWindowsMemorySample } from '../scripts/demo-e2e-memory/windows'
import { prepareWorkflowProcessObserver } from '../scripts/demo-e2e-workflow/process-observer'
import { windowsObserverArgs } from '../scripts/demo-e2e-workflow/process-observer/script'
import { createProcessObserverTransport } from '../scripts/demo-e2e-workflow/process-observer/transport'
import { parseWindowsProcesses } from '../scripts/demo-e2e-workflow/process-table'

async function bounded<T>(operation: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(message)), timeoutMs)
    })])
  }
  finally {
    clearTimeout(timer)
  }
}

async function stopFixture(workload: ChildProcess | undefined, done: Promise<void>) {
  workload?.stdin?.end()
  try {
    await bounded(done, 1000, '内存用例本体 EOF 合作退出未确认。')
  }
  catch (error) {
    if (workload && workload.exitCode === null && workload.signalCode === null) {
      workload.kill('SIGKILL')
    }
    try {
      await bounded(done, 1000, '内存用例本体强制退出未确认。')
    }
    catch (closeError) {
      throw new AggregateError([error, closeError], '内存用例本体回收未确认。')
    }
    throw error
  }
}

it.runIf(process.platform === 'win32')('真实 PowerShell 身份握手与中文错误使用同一无 BOM UTF-8 协议', async () => {
  let child: ChildProcess | undefined
  const createChild = ((...args: Parameters<typeof spawn>) => {
    const item = spawn(...args)
    child = item
    return item
  }) as typeof spawn
  const transport = createProcessObserverTransport('powershell', windowsObserverArgs, createChild)
  let failure: unknown
  try {
    const ready = parseWindowsProcesses(JSON.stringify(await transport.request({ kind: 'identity' }, 15_000)))
    expect(ready.some(row => row.pid === child!.pid)).toBe(true)
    const memory = parseWindowsMemorySample(await transport.request({ kind: 'memory', rootPid: child!.pid!, cwd: process.cwd() }, 5000))
    expect(memory.processCount).toBeGreaterThanOrEqual(1)
    expect(memory.topProcesses!.some(row => row.pid === child!.pid)).toBe(true)
    // 故意输入带中文的未知操作，验证真实异常文本未被本机代码页损坏。
    failure = await transport.request({ kind: '中文身份探针' } as never, 5000).catch(error => error)
    expect(failure).toBeInstanceOf(Error)
    expect(String(failure)).toContain('中文身份探针')
  }
  finally {
    if (failure !== undefined) {
      await expect(transport.close()).rejects.toBe(failure)
    }
    else {
      await transport.close()
    }
  }
  expect(child!.exitCode !== null || child!.signalCode !== null).toBe(true)
}, 15_000 + 10_000)

it.runIf(process.platform === 'win32')('长 Node 与真实子 Node 连续采样复用一个 PowerShell，指标保留两个实际 PID', async () => {
  const observers: ChildProcess[] = []
  const createChild = ((...args: Parameters<typeof spawn>) => {
    const item = spawn(...args)
    observers.push(item)
    return item
  }) as typeof spawn
  const observer = (await prepareWorkflowProcessObserver(undefined, { spawn: createChild }))!
  let workload: ReturnType<typeof spawn> | undefined
  let done = Promise.resolve()
  try {
    // 父进程持有子进程句柄，stdin EOF 后先回收子进程再退出；测试不按 PID 猜测清理。
    const launcher = `const child=require('node:child_process').spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); let stopped=false; const stop=()=>{if(stopped)return;stopped=true;child.once('close',()=>process.exit(0));child.kill();}; const lifetime=setTimeout(stop,20000); child.once('close',()=>{clearTimeout(lifetime);process.exit(0);}); console.log(child.pid); setInterval(()=>{},1000); process.stdin.resume(); process.stdin.on('end',stop);`
    workload = spawn(process.execPath, ['-e', launcher], { stdio: ['pipe', 'pipe', 'pipe'] })
    done = new Promise<void>((resolve) => {
      workload!.once('close', () => resolve())
    })
    const lines = createInterface({ input: workload.stdout! })
    let descendant: number
    const active = workload
    const ready = new Promise<number>((resolve, reject) => {
      lines.once('line', line => resolve(Number(line)))
      active.once('error', reject)
      active.once('close', (code, signal) => reject(new Error(`内存用例本体在握手前退出：code=${code} signal=${signal}`)))
    })
    try {
      descendant = await bounded(ready, 2000, '内存用例业务启动握手超时。')
      expect(Number.isInteger(descendant) && descendant > 0).toBe(true)
    }
    finally {
      lines.close()
    }
    for (let index = 0; index < 2; index++) {
      const sample = await observer.memory(workload.pid!, 5000)
      const pids = sample.topProcesses!.map(row => row.pid)
      expect(pids).toContain(workload.pid)
      expect(pids).toContain(descendant)
      expect(pids).not.toContain(observers[0]!.pid)
      expect(sample.processCount).toBeGreaterThanOrEqual(2)
      expect(sample.rssMb).toBeGreaterThan(0)
    }
    expect(observers).toHaveLength(1)
  }
  finally {
    try {
      await stopFixture(workload, done)
    }
    finally {
      await observer.close()
    }
  }
  expect(observers[0]!.exitCode !== null || observers[0]!.signalCode !== null).toBe(true)
}, 15_000 + 10_000)
