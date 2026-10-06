import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { assertWatchCommandActive } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/cancellation'
import { createWatchCommandSession } from '../tools/weapp-tailwindcss-scripts/src/watch-hmr-regression/session'
import { runWatchCommand } from './watch/hot-update/command'

describe('watch command cancellation lifecycle', () => {
  const roots: string[] = []
  beforeEach(() => {
    // 预期超时只取消本用例；不能把模拟信号写进调用方的全面流程标记。
    vi.stubEnv('E2E_WATCH_CANCEL_FILE', undefined)
  })
  afterEach(async () => {
    vi.unstubAllEnvs()
    await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
  })
  async function fixture() {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'watch-command-test-'))
    roots.push(root)
    return root
  }

  it('waits for cooperative source restoration and retains timeout failure', async () => {
    const root = await fixture()
    const source = path.join(root, 'source.txt')
    await fs.writeFile(source, 'original')
    const script = `
      const fs = require('node:fs');
      const source = process.env.PROBE_SOURCE;
      fs.writeFileSync(source, 'mutated');
      setInterval(() => {
        if (fs.existsSync(process.env.E2E_WATCH_CANCEL_FILE)) {
          fs.writeFileSync(source, 'original');
          process.exit(0);
        }
      }, 10);
    `
    await expect(runWatchCommand({ command: process.execPath, args: ['-e', script], cwd: root, env: { ...process.env, PROBE_SOURCE: source }, timeoutMs: 500, cleanupTimeoutMs: 2000, quiet: true })).rejects.toMatchObject({ timedOut: true })
    expect(await fs.readFile(source, 'utf8')).toBe('original')
  })

  it('stops a detached descendant that ignores cancellation before returning', async () => {
    const root = await fixture()
    const heartbeat = path.join(root, 'heartbeat.txt')
    const pidFile = path.join(root, 'child.pid')
    const childScript = 'const fs = require("node:fs"); setInterval(() => fs.writeFileSync(process.env.PROBE_HEARTBEAT, String(Date.now())), 20)'
    const script = `
      const fs = require('node:fs');
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(childScript)}], { detached: process.platform !== 'win32', stdio: 'ignore' });
      fs.writeFileSync(process.env.PROBE_PID, String(child.pid));
      setInterval(() => {}, 100);
    `
    try {
      await expect(runWatchCommand({ command: process.execPath, args: ['-e', script], cwd: root, env: { ...process.env, PROBE_HEARTBEAT: heartbeat, PROBE_PID: pidFile }, timeoutMs: 500, cleanupTimeoutMs: 100, quiet: true })).rejects.toMatchObject({ timedOut: true })
      const stopped = await fs.readFile(heartbeat, 'utf8')
      await new Promise(resolve => setTimeout(resolve, 150))
      expect(await fs.readFile(heartbeat, 'utf8')).toBe(stopped)
    }
    finally {
      const pid = Number(await fs.readFile(pidFile, 'utf8').catch(() => '0'))
      if (pid > 0) {
        try {
          process.kill(pid, 'SIGKILL')
        }
        catch {}
      }
    }
  })

  it('借用上层取消文件触发恢复，结束后不删除或重建借用文件', async () => {
    const root = await fixture()
    const source = path.join(root, 'source.txt')
    const cancel = path.join(root, 'parent-cancel')
    const seen = path.join(root, 'seen-cancel')
    await fs.writeFile(source, 'original')
    const script = `
      const fs = require('node:fs');
      fs.writeFileSync(process.env.PROBE_SOURCE, 'mutated');
      fs.writeFileSync(process.env.PROBE_SEEN, process.env.E2E_WATCH_CANCEL_FILE);
      setInterval(() => {
        if (fs.existsSync(process.env.E2E_WATCH_CANCEL_FILE)) {
          fs.writeFileSync(process.env.PROBE_SOURCE, 'original');
          process.exit(0);
        }
      }, 10);
    `
    const running = runWatchCommand({ command: process.execPath, args: ['-e', script], cwd: root, env: { ...process.env, E2E_WATCH_CANCEL_FILE: cancel, PROBE_SOURCE: source, PROBE_SEEN: seen }, timeoutMs: 2000, cleanupTimeoutMs: 200, quiet: true })
    const result = running.catch(error => error)
    await vi.waitFor(async () => expect(await fs.readFile(source, 'utf8')).toBe('mutated'))
    expect(await fs.readFile(seen, 'utf8')).toBe(cancel)
    await fs.writeFile(cancel, 'parent cancellation')
    const before = await fs.stat(cancel)
    expect(await result).toBeUndefined()
    expect(await fs.readFile(source, 'utf8')).toBe('original')
    expect(await fs.readFile(cancel, 'utf8')).toBe('parent cancellation')
    expect((await fs.stat(cancel)).ino).toBe(before.ino)
  })

  it.each([undefined, ''])('上层取消路径为 %s 时创建并清理本轮自有目录', async (parentCancel) => {
    const root = await fixture()
    const seen = path.join(root, 'seen-cancel')
    await runWatchCommand({ command: process.execPath, args: ['-e', 'require("node:fs").writeFileSync(process.env.PROBE_SEEN, process.env.E2E_WATCH_CANCEL_FILE)'], cwd: root, env: { ...process.env, E2E_WATCH_CANCEL_FILE: parentCancel, PROBE_SEEN: seen }, timeoutMs: 2000, quiet: true })
    const cancel = await fs.readFile(seen, 'utf8')
    expect(path.isAbsolute(cancel)).toBe(true)
    await expect(fs.access(path.dirname(cancel))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('rejects a cancelled session before process cleanup or spawn', async () => {
    const root = await fixture()
    const cancelFile = path.join(root, 'cancel')
    await fs.writeFile(cancelFile, 'cancel')
    vi.stubEnv('E2E_WATCH_CANCEL_FILE', cancelFile)
    expect(() => createWatchCommandSession(root, ['--version'], { quietSass: true })).toThrow('watch command was cancelled')
  })

  it('only interrupts a session when its own cancellation file exists', async () => {
    const root = await fixture()
    const cancelFile = path.join(root, 'cancel')
    const env = { E2E_WATCH_CANCEL_FILE: cancelFile }
    expect(() => assertWatchCommandActive(env)).not.toThrow()
    await fs.writeFile(cancelFile, 'cancel')
    expect(() => assertWatchCommandActive(env)).toThrow('watch command was cancelled')
    expect(() => assertWatchCommandActive({})).not.toThrow()
  })
})
