import { existsSync } from 'node:fs'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import * as processTools from '../../../packages/hbuilderx-runner/src/process'
import * as processObserver from '../../../scripts/demo-e2e-workflow/process-observer'
import * as processScope from '../../../scripts/demo-e2e-workflow/process-scope'
import * as processTable from '../../../scripts/demo-e2e-workflow/process-table'
import { launchGateEnvironment } from './launch-gate'
import { withLocalCommand } from './lifecycle'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true })
  }
})

it('Node 启动握手只查询本轮根 PID，共享 gate 截止；放行后恢复全树观察', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'website-startup-'))
  roots.push(root)
  const script = path.join(root, 'cli.cjs')
  const marker = path.join(root, 'started')
  await writeFile(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'started'); setInterval(() => {}, 1000)`)
  let payload: { directory: string, deadline: number }
  let pid: number
  let startupAt: number
  const now = Date.now.bind(Date)
  const assertStartup = (pids: readonly number[], timeoutMs: number) => {
    expect(pids).toEqual([pid])
    expect(existsSync(path.join(payload.directory, 'released'))).toBe(false)
    expect(timeoutMs).toBeGreaterThan(0)
    expect(timeoutMs).toBeLessThanOrEqual(4000)
    expect(timeoutMs).toBeLessThanOrEqual(payload.deadline - startupAt)
  }
  const assertReleased = () => expect(existsSync(path.join(payload.directory, 'released'))).toBe(true)
  if (process.platform === 'win32') {
    const prepare = processObserver.prepareWorkflowProcessObserver
    vi.spyOn(processObserver, 'prepareWorkflowProcessObserver').mockImplementation(async (signal) => {
      const observer = (await prepare(signal))!
      return {
        ...observer,
        subset: async (pids, timeoutMs, signal) => {
          assertStartup(pids, timeoutMs)
          return await observer.subset(pids, timeoutMs, signal)
        },
        table: async (timeoutMs, signal) => {
          assertReleased()
          return await observer.table(timeoutMs, signal)
        },
      }
    })
  }
  else {
    const subset = processTable.readProcessSubset
    vi.spyOn(processTable, 'readProcessSubset').mockImplementation(async (...args) => {
      const [group, pids, timeoutMs = 5000] = args
      expect(group).toBeUndefined()
      if (!existsSync(path.join(payload.directory, 'released'))) {
        assertStartup(pids, timeoutMs)
      }
      else {
        assertReleased()
        expect(timeoutMs).toBeGreaterThan(0)
        expect(timeoutMs).toBeLessThanOrEqual(5000)
      }
      // 保留扫描归属域，放行后的候选详情不能被 mock 降为游离探针。
      return await subset(...args)
    })
    const scoped = processScope.readPosixProcessScope
    vi.spyOn(processScope, 'readPosixProcessScope').mockImplementation(async (...args) => {
      assertReleased()
      return await scoped(...args)
    })
    vi.spyOn(processTable, 'readProcessTable').mockRejectedValue(new Error('POSIX 本地命令不得读取全机详细身份表'))
  }
  let fullScanObserved = false
  const collect = processTable.collectOwnedProcesses
  vi.spyOn(processTable, 'collectOwnedProcesses').mockImplementation((...args) => {
    if (existsSync(path.join(payload.directory, 'released'))) {
      fullScanObserved = true
    }
    return collect(...args)
  })
  const spawn = vi.spyOn(processTools, 'spawnCommand')
  await withLocalCommand({ command: process.execPath, args: [script], cwd: root }, new AbortController().signal, async () => {
    await vi.waitFor(async () => expect(await readFile(marker, 'utf8')).toBe('started'))
    await vi.waitFor(() => expect(fullScanObserved).toBe(true))
  }, (command) => {
    pid = command.child.pid!
    payload = JSON.parse(spawn.mock.calls[0][0].env![launchGateEnvironment]!)
    // 确定性模拟 prepare/spawn 已消耗的预算，身份采集不能重新领取五秒。
    vi.spyOn(Date, 'now').mockImplementation(() => now() + 1000)
    startupAt = Date.now()
  })
  expect(fullScanObserved).toBe(true)
})
