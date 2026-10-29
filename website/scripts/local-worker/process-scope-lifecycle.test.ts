import { rm } from 'node:fs/promises'
import process from 'node:process'
import { expect, it, vi } from 'vitest'
import * as commands from '../../../packages/hbuilderx-runner/src/process'
import * as processQueries from '../../../scripts/demo-e2e-workflow/process-command'
import * as processTable from '../../../scripts/demo-e2e-workflow/process-table'
import { runWithCleanup } from '../../../scripts/e2e-preflight/cleanup'
import { withLocalWorker } from './server'
import { createLocalTestScope, localIntegrationTimeout, localTestCleanupMs } from './test-scope'
import { fixtureHtml, workerFixture } from './test-support'

const timeoutMs = localIntegrationTimeout(1, 2000 + 5000)

// Windows 保留既有热 CIM 路径；本用例只验证 POSIX 的轻拓扑适配。
it.skipIf(process.platform === 'win32')('真实 Worker 不读取全机详细身份表，仍可请求并确认本轮根进程收尾', async ({ signal }) => {
  const scope = createLocalTestScope(signal)
  let fixture: Awaited<ReturnType<typeof workerFixture>> | undefined
  try {
    fixture = await workerFixture('ready', timeoutMs + localTestCleanupMs)
    const detailedTable = vi.spyOn(processTable, 'readProcessTable').mockRejectedValue(new Error('禁止本地命令读取全机详细身份表'))
    const queries = vi.spyOn(processQueries, 'runProcessCommand')
    const spawn = vi.spyOn(commands, 'spawnCommand')
    await scope.run(signal => withLocalWorker(async (context) => {
      const response = await context.request('/')
      expect(response.status).toBe(200)
      expect(response.text).toBe(fixtureHtml)
      // 等一次真实周期扫描，不能只凭 gate 的根身份查询通过。
      await vi.waitFor(() => {
        context.signal.throwIfAborted()
        expect(queries.mock.calls.some(([command, args]) => command === 'ps' && args.includes('pid=,ppid=,pgid='))).toBe(true)
      }, { timeout: 5000 })
      context.signal.throwIfAborted()
    }, { ...fixture!.options, signal }))
    expect(detailedTable).not.toHaveBeenCalled()
    expect(spawn).toHaveBeenCalledOnce()
    const child = spawn.mock.results[0]!.value.child
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  }
  finally {
    await runWithCleanup(() => scope.close(), async () => {
      vi.restoreAllMocks()
      if (fixture) {
        await runWithCleanup(() => fixture!.stopDescendants(), () => rm(fixture!.root, { recursive: true, force: true }))
      }
    })
  }
}, timeoutMs)
