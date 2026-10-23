import type { HBuilderXCommandOptions } from '../../../packages/hbuilderx-runner/src/types'
import { existsSync } from 'node:fs'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as processTools from '../../../packages/hbuilderx-runner/src/process'
import * as processObserver from '../../../scripts/demo-e2e-workflow/process-observer'
import * as processTable from '../../../scripts/demo-e2e-workflow/process-table'
import { formatWorkflowError } from '../../../scripts/e2e-preflight/cleanup'
import { runLocalCommand } from './command'
import { launchGateEnvironment, prepareLocalCommandGate } from './launch-gate'
import { withLocalCommand } from './lifecycle'

const roots: string[] = []
const pending: Array<{ release: () => void, done: Promise<unknown> }> = []
afterEach(async () => {
  for (const item of pending.splice(0)) {
    item.release()
    await item.done
  }
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

async function fixture(code = 0, nodeOptions = '') {
  const root = await mkdtemp(path.join(tmpdir(), 'website gate 中文 & '))
  roots.push(root)
  const marker = path.join(root, 'main.json')
  const script = path.join(root, 'command with spaces.cjs')
  await writeFile(script, `
    const fs = require('node:fs')
    const child = require('node:child_process').spawnSync(process.execPath, ['-e', 'console.log(JSON.stringify({ nodeOptions: process.env.NODE_OPTIONS, gate: process.env.${launchGateEnvironment} }))'], { encoding: 'utf8' })
    fs.writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ pid: process.pid, cwd: process.cwd(), nodeOptions: process.env.NODE_OPTIONS, gate: process.env.${launchGateEnvironment}, args: process.argv.slice(2), child: JSON.parse(child.stdout), childStatus: child.status }))
    console.log('stdout from original CLI')
    console.error('stderr from original CLI')
    process.exit(${code})
  `)
  const options: HBuilderXCommandOptions = { command: process.execPath, args: [script, '参数 with spaces'], cwd: root, env: { NODE_OPTIONS: nodeOptions } }
  return { root, marker, options }
}

/** 首次探针由测试显式放行，业务脚本的快慢不参与竞态判定。 */
function controlledProbe(options: HBuilderXCommandOptions, signal = new AbortController().signal, fail?: () => void) {
  const spawn = vi.spyOn(processTools, 'spawnCommand')
  let release!: () => void
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let entered!: (value: { directory: string, pid: number }) => void
  const ready = new Promise<{ directory: string, pid: number }>((resolve) => {
    entered = resolve
  })
  const control = (readTable: typeof processTable.readProcessTable) => vi.fn(readTable).mockImplementationOnce(async (...args) => {
    const payload = JSON.parse(spawn.mock.calls[0][0].env![launchGateEnvironment]!) as { directory: string, deadline: number }
    const pid = spawn.mock.results[0].value.child.pid as number
    await vi.waitFor(() => expect(existsSync(path.join(payload.directory, `ready-${pid}`))).toBe(true), { timeout: Math.max(1, payload.deadline - Date.now()) })
    entered({ directory: payload.directory, pid })
    await released
    fail?.()
    return await readTable(...args)
  })
  if (process.platform === 'win32') {
    const prepare = processObserver.prepareWorkflowProcessObserver
    vi.spyOn(processObserver, 'prepareWorkflowProcessObserver').mockImplementation(async (signal) => {
      const observer = await prepare(signal)
      return observer ? { ...observer, table: control((timeoutMs = 5000, signal) => observer.table(timeoutMs, signal)) } : undefined
    })
  }
  else {
    const readTable = processTable.readProcessTable
    vi.spyOn(processTable, 'readProcessTable').mockImplementation(control(readTable))
  }
  const done = runLocalCommand(options, signal).then(() => undefined, error => error)
  pending.push({ release, done })
  return {
    spawn,
    ready: Promise.race([ready, done.then((error) => {
      throw error ?? new Error('命令在进入 gate 前结束。')
    })]),
    release,
    done,
  }
}

it.each([0, 7])('首次探针延迟时阻止 Node 业务启动，放行后保留快速退出码 %s 与原始环境', async (code) => {
  const item = await fixture(code)
  const preload = path.join(item.root, 'user preload 中文.cjs')
  const preloadMarker = path.join(item.root, 'user-preload')
  await writeFile(preload, `require('node:fs').writeFileSync(${JSON.stringify(preloadMarker)}, 'loaded')`)
  const nodeOptions = code === 0 ? '' : `--require=${JSON.stringify(preload)}`
  item.options.env = { NODE_OPTIONS: nodeOptions }
  const launch = controlledProbe(item.options)
  const { directory, pid } = await launch.ready
  expect(existsSync(item.marker)).toBe(false)
  expect(existsSync(preloadMarker)).toBe(false)
  expect(existsSync(path.join(directory, 'released'))).toBe(false)
  launch.release()
  const error = await launch.done
  if (code === 0) {
    expect(error, formatWorkflowError(error)).toBeUndefined()
  }
  else {
    expect(error?.message, formatWorkflowError(error)).toContain(`exit=${code} signal=null`)
    expect(error.message).toContain('stdout from original CLI')
    expect(error.message).toContain('stderr from original CLI')
    expect(existsSync(preloadMarker)).toBe(true)
  }
  expect(JSON.parse(await readFile(item.marker, 'utf8'))).toEqual({ pid, cwd: await realpath(item.root), nodeOptions, args: ['参数 with spaces'], child: { nodeOptions }, childStatus: 0 })
  expect(launch.spawn.mock.calls[0][0]).toMatchObject({ command: item.options.command, args: item.options.args, cwd: item.root })
  expect(existsSync(directory)).toBe(false)
})

it.each(['probe', 'cancel', 'late'] as const)('启动身份采集 %s 失败不放行业务，保留错误并回收原进程和凭据', async (kind) => {
  const item = await fixture()
  const controller = new AbortController()
  const failure = new Error('controlled startup probe failure')
  const now = Date.now.bind(Date)
  const launch = controlledProbe(item.options, controller.signal, () => {
    if (kind === 'probe') {
      throw failure
    }
    if (kind === 'late') {
      vi.spyOn(Date, 'now').mockImplementation(() => now() + 6000)
    }
  })
  const { directory, pid } = await launch.ready
  if (kind === 'cancel') {
    controller.abort(failure)
  }
  launch.release()
  const error = await launch.done
  expect(formatWorkflowError(error)).toContain(kind === 'late' ? '超过截止时间' : failure.message)
  expect(existsSync(item.marker)).toBe(false)
  expect(existsSync(directory)).toBe(false)
  expect(() => process.kill(pid, 0)).toThrow()
})

it('spawn 回调仍获得原 ChildProcess，放行后保留退出信号和标准流配置', async () => {
  const item = await fixture()
  const onSpawn = vi.fn()
  const options = { ...item.options, args: ['-e', 'process.kill(process.pid, "SIGTERM")'], stdio: 'inherit' as const }
  const original = processTools.spawnCommand(options)
  const expected = await original.closed
  await original.stop()
  const exit = await withLocalCommand(options, new AbortController().signal, command => command.closed, onSpawn)
  expect(exit).toEqual(expected)
  expect(onSpawn).toHaveBeenCalledOnce()
  const child = onSpawn.mock.calls[0][0].child
  expect(child.stdio).toEqual([null, null, null])
  expect(child.signalCode).toBe(expected.signal)
})

it('spawn 回调失败时不放行 Node 业务，仍关闭原进程并删除 gate', async () => {
  const item = await fixture()
  const failure = new Error('onSpawn rejected')
  const spawn = vi.spyOn(processTools, 'spawnCommand')
  const action = vi.fn()
  await expect(withLocalCommand(item.options, new AbortController().signal, action, () => {
    throw failure
  })).rejects.toBe(failure)
  expect(action).not.toHaveBeenCalled()
  expect(existsSync(item.marker)).toBe(false)
  const { directory } = JSON.parse(spawn.mock.calls[0][0].env![launchGateEnvironment]!)
  expect(existsSync(directory)).toBe(false)
  expect(() => process.kill(spawn.mock.results[0].value.child.pid, 0)).toThrow()
})

it('仅已知 Node 可执行文件使用 gate，显式空 NODE_OPTIONS 优先于进程环境', async () => {
  vi.stubEnv('NODE_OPTIONS', '--trace-warnings')
  expect(await prepareLocalCommandGate({ command: 'pnpm', args: ['build'], cwd: process.cwd() })).toBeUndefined()
  const gate = await prepareLocalCommandGate({ command: process.execPath, args: [], cwd: process.cwd(), env: { NODE_OPTIONS: '' } })
  try {
    expect(JSON.parse(gate!.options.env[launchGateEnvironment]).nodeOptions).toBe('')
  }
  finally {
    await gate?.close()
  }
})
