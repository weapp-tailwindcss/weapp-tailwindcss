import type { SpawnedHBuilderXCommand } from '../packages/hbuilderx-runner/src/types'
import { randomUUID } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it, vi } from 'vitest'
import { readProcessSubset } from '../scripts/demo-e2e-workflow/process-table'
import { createWebSession } from './hbuilderx-local/web/session'

const state = vi.hoisted(() => ({ args: [] as string[], commands: [] as SpawnedHBuilderXCommand[] }))
vi.mock('../packages/hbuilderx-runner/src', async (original) => {
  const actual = await original<typeof import('../packages/hbuilderx-runner/src')>()
  return {
    ...actual,
    runCommand: vi.fn(async () => {}),
    spawnCommand: (options: Parameters<typeof actual.spawnCommand>[0]) => {
      const command = actual.spawnCommand({ ...options, command: process.execPath, args: state.args })
      state.commands.push(command)
      return command
    },
  }
})

let directory: string
const identities = new Map<number, string>()
afterEach(async () => {
  const failures: unknown[] = []
  for (const command of state.commands) {
    if (command.child.exitCode === null && command.child.signalCode === null) {
      try {
        await command.stop()
      }
      catch (error) { failures.push(error) }
    }
  }
  // 兜底只认本轮登记的出生身份，不对旧 PGID 或同名进程发信号。
  for (const [pid, started] of identities) {
    try {
      const current = (await readProcessSubset(undefined, [pid])).find(row => row.pid === pid)
      if (current?.started === started && !current.zombie) {
        process.kill(pid, 'SIGKILL')
      }
    }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
        failures.push(error)
      }
    }
  }
  try {
    await vi.waitFor(async () => {
      const current = await readProcessSubset(undefined, [...identities.keys()])
      expect(current.filter(row => identities.get(row.pid) === row.started && !row.zombie)).toEqual([])
    })
  }
  catch (error) { failures.push(error) }
  if (failures.length) {
    throw new AggregateError(failures, `隔离进程收尾未完整确认，保留 ${directory}`)
  }
  process.stdout.write(`owned-fixture-cleanup ${JSON.stringify([...identities])}\n`)
  identities.clear()
  state.commands.length = 0
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})

async function fixture() {
  directory = await mkdtemp(path.join(tmpdir(), 'web-stop-owned-'))
  const token = randomUUID()
  const ready = path.join(directory, 'ready.json')
  const beat = path.join(directory, 'heartbeat.txt')
  const release = path.join(directory, 'release.txt')
  const worker = path.join(directory, 'worker.cjs')
  const root = path.join(directory, 'root.cjs')
  await writeFile(worker, `
    const fs = require('node:fs');
    fs.writeFileSync(${JSON.stringify(ready)}, JSON.stringify({ pid: process.pid, token: ${JSON.stringify(token)} }));
    let stopping = false;
    setInterval(() => {
      if (stopping && fs.existsSync(${JSON.stringify(release)})) { process.exit(0); }
      fs.appendFileSync(${JSON.stringify(beat)}, '.');
    }, 20);
    process.on('SIGTERM', () => { stopping = true; });
  `)
  await writeFile(root, `
    require('node:child_process').spawn(process.execPath, [${JSON.stringify(worker)}], { stdio: 'ignore' });
    setInterval(() => {}, 1000);
    process.on('SIGTERM', () => process.exit(0));
  `)
  state.args = [root, token]
  const session = await createWebSession(directory, false, path.join(directory, 'server.log'))
  let workerPid = 0
  await vi.waitFor(async () => {
    const data = JSON.parse(await readFile(ready, 'utf8'))
    expect(data.token).toBe(token)
    expect(Number.isInteger(data.pid) && data.pid > 0).toBe(true)
    workerPid = data.pid
  })
  const command = state.commands[0]!
  const rows = await readProcessSubset(undefined, [command.child.pid!, workerPid])
  const rootIdentity = rows.find(row => row.pid === command.child.pid)!
  const workerIdentity = rows.find(row => row.pid === workerPid)!
  expect(rootIdentity).toBeDefined()
  expect(workerIdentity?.parent).toBe(rootIdentity.pid)
  if (process.platform !== 'win32') {
    expect(rootIdentity.group).toBe(rootIdentity.pid)
    expect(workerIdentity.group).toBe(rootIdentity.group)
  }
  for (const row of rows) {
    identities.set(row.pid, row.started)
  }
  expect(identities.size).toBe(2)
  await vi.waitFor(async () => expect((await readFile(beat, 'utf8')).length).toBeGreaterThan(1))
  return { session, command, workerPid, release }
}

it.skipIf(process.platform === 'win32')('真实 CLI 根先 close 后，Web stop 仍等同组延迟退出的 worker，兜底前确认空集', async () => {
  const { session, command, workerPid, release } = await fixture()
  let stopCompleted = false
  const rootClosed = command.closed.then(async () => {
    try {
      expect(stopCompleted).toBe(false)
      const rows = await readProcessSubset(undefined, [workerPid])
      return rows.some(row => row.pid === workerPid && row.started === identities.get(workerPid) && !row.zombie)
    }
    finally {
      await writeFile(release, '本轮根已关闭，允许 worker 退出')
    }
  })
  void rootClosed.catch(() => {})
  await session.stop().then(() => {
    stopCompleted = true
  })
  expect(await rootClosed).toBe(true)
  const rows = await readProcessSubset(undefined, [command.child.pid!, workerPid])
  expect(rows.filter(row => identities.get(row.pid) === row.started && !row.zombie)).toEqual([])
  const bytes = (await readFile(path.join(directory, 'heartbeat.txt'), 'utf8')).length
  await new Promise(resolve => setTimeout(resolve, 80))
  expect((await readFile(path.join(directory, 'heartbeat.txt'), 'utf8')).length).toBe(bytes)
})

it('CLI 根在 stop 前已退出必须报错，不能借受管句柄的 close guard 宣称整棵树已停', async () => {
  const { session, command, workerPid } = await fixture()
  command.child.kill('SIGKILL')
  await command.closed
  await expect(session.stop()).rejects.toThrow('Web 服务在停止前已退出')
  const rows = await readProcessSubset(undefined, [workerPid])
  expect(rows.some(row => row.pid === workerPid && row.started === identities.get(workerPid) && !row.zombie)).toBe(true)
})
