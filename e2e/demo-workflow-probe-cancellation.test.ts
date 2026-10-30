import type { ChildProcess } from 'node:child_process'
import type { ProcessIdentity } from '../scripts/demo-e2e-workflow/process-table'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { afterEach, expect, it, vi } from 'vitest'
import { containsWorkflowError } from '../scripts/demo-e2e-workflow/cancellation'
import { readProcessSubset } from '../scripts/demo-e2e-workflow/process-table'
import { runStep } from '../scripts/demo-e2e-workflow/step'
import { assertFixtureProcessStopped, readFixtureProcessState } from '../website/scripts/local-worker/test-process-state'
import { fixtureHtml } from '../website/scripts/local-worker/test-support'

const state = vi.hoisted(() => ({
  armed: false,
  persistent: false,
  failures: 0,
  original: new Error('本轮身份探针致命错误'),
  cleanup: new Error('本轮清理身份探针失败'),
  budgets: [] as number[],
  child: undefined as ChildProcess | undefined,
  tree: undefined as ReturnType<typeof import('../scripts/demo-e2e-workflow/process-tree').createWorkflowProcessTree> | undefined,
}))

function probe<T>(timeoutMs: number, action: () => Promise<T>) {
  if (state.armed) {
    state.budgets.push(timeoutMs)
    if (state.failures === 0 || state.persistent) {
      return Promise.reject(state.failures++ === 0 ? state.original : state.cleanup)
    }
  }
  return action()
}

vi.mock('../scripts/demo-e2e-workflow/process-table', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scripts/demo-e2e-workflow/process-table')>()
  return {
    ...actual,
    readProcessTable: (timeoutMs = 5000, signal?: AbortSignal) => probe(timeoutMs, () => actual.readProcessTable(timeoutMs, signal)),
    readProcessSubset: (group: number | undefined, pids: readonly number[], timeoutMs = 5000, signal?: AbortSignal) => probe(timeoutMs, () => actual.readProcessSubset(group, pids, timeoutMs, signal)),
  }
})
vi.mock('../scripts/demo-e2e-workflow/process-observer', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scripts/demo-e2e-workflow/process-observer')>()
  return { ...actual, prepareWorkflowProcessObserver: async (signal?: AbortSignal) => {
    const observer = await actual.prepareWorkflowProcessObserver(signal)
    return observer && {
      ...observer,
      table: (timeoutMs: number, signal?: AbortSignal) => probe(timeoutMs, () => observer.table(timeoutMs, signal)),
      subset: (pids: readonly number[], timeoutMs: number, signal?: AbortSignal) => probe(timeoutMs, () => observer.subset(pids, timeoutMs, signal)),
    }
  } }
})
vi.mock('../scripts/demo-e2e-workflow/process-tree', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../scripts/demo-e2e-workflow/process-tree')>()
  return { ...actual, createWorkflowProcessTree: (...[child, closed, options]: Parameters<typeof actual.createWorkflowProcessTree>) => {
    state.child = child
    // 夹具只缩短合作等待；生产的 5 秒身份探针和 2 秒强制清理预算保持原值。
    const tree = actual.createWorkflowProcessTree(child, closed, { ...options, cooperativeMs: 1000 })
    state.tree = {
      ...tree,
      capture(deadline?: number) {
        if (!state.armed || state.failures !== 0) {
          return tree.capture(deadline)
        }
        // 首个故意失败的查询在同一同步时刻取预算；返回 Promise 即恢复真实取消与清理时钟。
        const startedAt = Date.now()
        const clock = vi.spyOn(Date, 'now').mockReturnValue(startedAt)
        try {
          return tree.capture(deadline)
        }
        finally {
          clock.mockRestore()
        }
      },
    }
    return state.tree
  } }
})

afterEach(() => {
  state.armed = false
  state.persistent = false
  state.failures = 0
  state.budgets = []
  state.child = undefined
  state.tree = undefined
  vi.restoreAllMocks()
})

it.each([false, true])('内部探针失败先合作取消，真实 launcher、消费者及独立 Worker 全部退出（清理探针持续失败=%s）', async (persistent) => {
  const root = await mkdtemp(path.join(tmpdir(), 'workflow probe 中文 '))
  const controller = new AbortController()
  const identities = new Map<number, ProcessIdentity>()
  const workerInfo = path.join(root, 'worker.json')
  const ownerInfo = path.join(root, 'owner.pid')
  const ownerStopped = path.join(root, 'owner-stopped')
  const heartbeat = path.join(root, 'heartbeat')
  const workerScript = path.join(root, 'worker.cjs')
  const ownerScript = path.join(root, 'owner.mts')
  const launcherScript = path.join(root, 'launcher.cjs')
  await writeFile(workerScript, `
    const fs = require('node:fs'); const http = require('node:http');
    const token = ${JSON.stringify(randomUUID())};
    const server = http.createServer((req, res) => {
      res.end(req.url === '/identity' || req.url.startsWith('/stop/') ? token : ${JSON.stringify(fixtureHtml)});
      if (req.url === '/stop/' + token) stop();
    });
    const heartbeat = setInterval(() => fs.writeFileSync(${JSON.stringify(heartbeat)}, String(Date.now())), 20);
    function stop() { clearInterval(heartbeat); server.closeAllConnections(); server.close(); }
    process.on('SIGTERM', stop);
    server.listen(Number(process.argv[2]), '127.0.0.1', () => {
      fs.writeFileSync(${JSON.stringify(workerInfo)}, JSON.stringify({ pid: process.pid, port: server.address().port, token }));
      console.log('Ready on http://127.0.0.1:' + server.address().port);
    });
  `)
  // 复用真实网站消费者及其内部 Worker 生命周期，不启动 Wrangler、浏览器或设备。
  await writeFile(ownerScript, `
    import fs from 'node:fs/promises';
    import { withLocalWorker } from ${JSON.stringify(pathToFileURL(path.resolve('website/scripts/local-worker/server.ts')).href)};
    await fs.mkdir(${JSON.stringify(path.join(root, 'build'))});
    await fs.writeFile(${JSON.stringify(path.join(root, 'build', 'index.html'))}, ${JSON.stringify(fixtureHtml)});
    await fs.writeFile(${JSON.stringify(ownerInfo)}, String(process.pid));
    try {
      await withLocalWorker(async ({ signal }) => {
        await new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(signal.reason), { once: true }); signal.throwIfAborted(); });
      }, { websiteRoot: ${JSON.stringify(root)}, createCommand: async (_, port) => ({ command: process.execPath, args: [${JSON.stringify(workerScript)}, String(port)], cwd: ${JSON.stringify(root)} }) });
    } catch (error) { process.exitCode = 1; }
    finally { await fs.writeFile(${JSON.stringify(ownerStopped)}, 'stopped'); }
  `)
  await writeFile(launcherScript, `
    const { spawn } = require('node:child_process');
    const owner = spawn(process.execPath, ['--import', 'tsx', ${JSON.stringify(ownerScript)}], { cwd: ${JSON.stringify(process.cwd())}, env: process.env, stdio: 'inherit' });
    owner.on('error', error => { console.error(error); process.exitCode = 1; });
    owner.on('close', code => { process.exitCode = code || 1; });
  `)
  let finished = false
  let outcome: unknown
  const running = runStep({ name: '真实三层内部取消', command: process.execPath, args: [launcherScript] }, 1, 2, {}, process.env, controller.signal).catch(error => error).then((error) => {
    finished = true
    outcome = error
    return error
  })
  let worker: { pid: number, port: number, token: string } | undefined
  try {
    await vi.waitFor(async () => {
      expect(finished, String(outcome)).toBe(false)
      worker = JSON.parse(await readFile(workerInfo, 'utf8'))
      const owner = Number(await readFile(ownerInfo, 'utf8'))
      const owned = await state.tree!.capture()
      for (const pid of [state.child!.pid!, owner, worker!.pid]) {
        expect(owned.has(pid)).toBe(true)
        identities.set(pid, owned.get(pid)!)
      }
      expect(await readFile(heartbeat, 'utf8')).not.toBe('')
    }, { timeout: 70_000 })
    state.persistent = persistent
    state.armed = true
    const error = await running
    state.armed = false
    expect(error).toBeInstanceOf(Error)
    expect(error.cause).toBe(state.original)
    expect(containsWorkflowError(error, state.original)).toBe(true)
    expect(error.stepReport.exitCode).toBe(1)
    expect(error.stepReport.error).toContain(state.original.message)
    expect(state.budgets[0]).toBe(5000)
    if (persistent) {
      expect(error.stepReport.error).toContain(state.cleanup.message)
      expect(error.stepReport.error).toContain('清理未成功')
      expect(state.budgets.some(value => value > 1 && value <= 2000)).toBe(true)
    }
    expect(await readFile(ownerStopped, 'utf8')).toBe('stopped')
    for (const [pid, identity] of identities) {
      expect((await readFixtureProcessState(pid, identity)).kind).not.toBe('running')
    }
    await assertFixtureProcessStopped(worker!, identities.get(worker!.pid))
    const lastHeartbeat = await readFile(heartbeat, 'utf8')
    await delay(100)
    expect(await readFile(heartbeat, 'utf8')).toBe(lastHeartbeat)
  }
  finally {
    state.armed = false
    controller.abort(new Error('结束本轮合成夹具'))
    await running
    if (worker) {
      const identity = identities.get(worker.pid)
      const current = await readFixtureProcessState(worker.pid, identity)
      if (identity && current.kind === 'running') {
        const base = new URL(`http://127.0.0.1:${worker.port}/`)
        expect(await (await fetch(new URL('identity', base), { signal: AbortSignal.timeout(2000) })).text()).toBe(worker.token)
        await fetch(new URL(`stop/${worker.token}`, base), { signal: AbortSignal.timeout(2000) })
      }
    }
    for (const [pid, identity] of [...identities].reverse()) {
      const current = (await readProcessSubset(undefined, [pid])).find(row => row.pid === pid)
      if (current?.started === identity.started && !current.zombie) {
        process.kill(pid, 'SIGTERM')
        await vi.waitFor(async () => expect((await readFixtureProcessState(pid, identity)).kind).not.toBe('running'), { timeout: 5000 })
      }
    }
    await rm(root, { recursive: true, force: true })
  }
}, 90_000)
