import { once } from 'node:events'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { execa } from 'execa'
import { expect, it } from 'vitest'
import { observeIosScreenshotStreams } from './react-native/ios-screenshot-streams'

it('真实根进程退出不能冒充输出流结束；只读观察在后代释放自有 pipe 后结束', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'rn-owned-stdio-'))
  const ready = path.join(directory, 'ready.json')
  const release = path.join(directory, 'release')
  const descendant = `
    const fs = require('node:fs');
    const path = require('node:path');
    const staged = path.join(path.dirname(process.argv[1]), 'ready-pending.json');
    fs.writeFileSync(staged, JSON.stringify({ pid: process.pid }));
    fs.renameSync(staged, process.argv[1]);
    const poll = setInterval(() => { if (fs.existsSync(process.argv[2])) process.exit(0); }, 10);
    setTimeout(() => { clearInterval(poll); process.exit(1); }, 30000);
  `
  const root = `
    require('node:child_process').spawn(process.execPath, ['-e', process.argv[1], ...process.argv.slice(2)], { stdio: ['ignore', 'inherit', 'inherit'] });
    setInterval(() => {}, 1000);
  `
  const controller = new AbortController()
  const command = execa(process.execPath, ['-e', root, descendant, ready, release], { cancelSignal: controller.signal, forceKillAfterDelay: 100 })
  let settled = false
  const completion = command.catch(error => error).finally(() => {
    settled = true
  })
  const exited = once(command, 'exit')
  const closed = once(command, 'close')
  const started = performance.now()
  const observer = observeIosScreenshotStreams(command, () => performance.now() - started)
  const captureFailure = new Error('owned fixture canceled')
  try {
    const deadline = performance.now() + 10_000
    while (true) {
      try {
        expect(JSON.parse(await fs.readFile(ready, 'utf8')).pid).toBeGreaterThan(0)
        break
      }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || performance.now() >= deadline) {
          throw error
        }
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    }
    controller.abort(captureFailure)
    await exited
    observer.snapshot('exited')
    expect(settled).toBe(false)
    for (const name of ['stdout', 'stderr'] as const) {
      expect(observer.records[name]).toMatchObject({ observed: true, events: {}, exited: { ended: false, closed: false } })
    }
    await fs.writeFile(release, '')
    const failure = await completion
    await closed
    observer.snapshot('settled')
    expect(failure.isCanceled).toBe(true)
    expect(failure.cause).toBe(captureFailure)
    for (const name of ['stdout', 'stderr'] as const) {
      const record = observer.records[name]
      expect(record.events.end).toBeGreaterThanOrEqual(record.exited!.atMs)
      expect(record.events.close).toBeGreaterThanOrEqual(record.events.end!)
      expect(record.settled).toMatchObject({ ended: true, closed: true, destroyed: true })
    }
  }
  finally {
    await fs.writeFile(release, '')
    if (command.exitCode === null && command.signalCode === null) {
      command.kill('SIGKILL')
    }
    await completion
    await closed
    observer.dispose()
    await fs.rm(directory, { recursive: true, force: true })
  }
}, 45_000)
