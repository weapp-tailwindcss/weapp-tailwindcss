import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { repo } from './catalog.mjs'
import { ownedProcessGroups } from './process-groups.mjs'
import { start, startProcess, until } from './process.mjs'

function killOwnedProcess(pid) {
  try {
    process.kill(pid, 'SIGKILL')
  }
  catch (error) {
    if (error.code !== 'ESRCH') {
      throw error
    }
  }
}

it.skipIf(process.platform === 'win32').each([false, true])('停止整个 POSIX 进程组，即使启动器已退出 (%s)', async (exitBeforeStop) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'demo-process-stop-'))
  let descendantPid
  let session
  try {
    const descendant = path.join(directory, 'descendant.cjs')
    const launcher = path.join(directory, 'launcher.cjs')
    await writeFile(descendant, `
      process.on('SIGTERM', () => {})
      console.log('descendant-ready:' + process.pid)
      process.send('ready')
      setInterval(() => {}, 1000)
    `)
    await writeFile(launcher, `
      const { fork } = require('node:child_process')
      const child = fork(${JSON.stringify(descendant)}, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
      child.once('message', () => {
        child.disconnect()
        ${exitBeforeStop ? 'process.exit(0)' : 'setInterval(() => {}, 1000)'}
      })
    `)
    session = exitBeforeStop
      ? startProcess(process.execPath, [launcher], repo, {})
      : start(['exec', 'node', launcher], repo, {})
    await until(() => {
      const match = session.log().match(/descendant-ready:(\d+)/)
      expect(match).not.toBeNull()
      descendantPid = Number(match[1])
    }, undefined, 5000)
    if (exitBeforeStop) {
      await until(() => expect(() => session.ensureRunning()).toThrow(), undefined, 5000)
    }
    const stopped = session.stop()
    const result = await Promise.race([stopped.then(() => 'stopped'), delay(6000, 'hung')])
    expect(result).toBe('stopped')
    expect(session.stop()).toBe(stopped)
  }
  finally {
    if (descendantPid) {
      killOwnedProcess(descendantPid)
    }
    await session?.stop()
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)

it('进程组归属覆盖乱序后代与独立组，排除调用方共享组和无关进程', () => {
  const table = '14 13 13\n10 1 10\n13 11 13\n11 10 10\n9 1 9\n15 10 9'
  expect(ownedProcessGroups(table, 10).toSorted()).toEqual([10, 13])
  expect(ownedProcessGroups('', 10)).toEqual([10])
})
