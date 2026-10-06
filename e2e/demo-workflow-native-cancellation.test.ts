import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { describe, expect, it, vi } from 'vitest'
import { createWorkflowProcessTree } from '../scripts/demo-e2e-workflow/process-tree'

function stopKnown(pid?: number) {
  if (!pid) {
    return
  }
  try {
    process.kill(pid, 'SIGKILL')
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error
    }
  }
}

function closed(child: ChildProcess) {
  return new Promise<void>((resolve) => {
    child.once('close', () => resolve())
  })
}

describe('隔离进程内的真实信号与合作恢复', () => {
  it.skipIf(process.platform === 'win32').each(['SIGINT', 'SIGTERM'] as const)('%s 沿现有 watch 取消文件进入 finally，恢复源码后才返回阶段报告', async (signal) => {
    const root = await mkdtemp(path.join(tmpdir(), 'workflow-native-cancel-'))
    const source = path.join(root, 'source.txt')
    const resultFile = path.join(root, 'result.json')
    const leafPidFile = path.join(root, 'leaf.pid')
    const watchPidFile = path.join(root, 'watch.pid')
    await writeFile(source, 'original\r\n中文')
    const sourceBytes = await readFile(source)
    const moduleUrl = (file: string) => pathToFileURL(path.resolve(file)).href
    const leaf = `
      const fs = require('node:fs');
      fs.writeFileSync(${JSON.stringify(leafPidFile)}, String(process.pid));
      const source = ${JSON.stringify(source)};
      const original = fs.readFileSync(source);
      (async () => {
        try {
          fs.writeFileSync(source, 'mutated');
          while (!fs.existsSync(process.env.E2E_WATCH_CANCEL_FILE)) await new Promise(resolve => setTimeout(resolve, 10));
        } finally { fs.writeFileSync(source, original); }
      })().catch(error => { console.error(error); process.exitCode = 1; });
    `
    const watch = `
      import fs from 'node:fs';
      import { runWatchCommand } from ${JSON.stringify(moduleUrl('e2e/watch/hot-update/command.ts'))};
      fs.writeFileSync(${JSON.stringify(watchPidFile)}, String(process.pid));
      await runWatchCommand({ command: process.execPath, args: ['-e', ${JSON.stringify(leaf)}], cwd: ${JSON.stringify(root)}, env: process.env, timeoutMs: 10000, quiet: true });
    `
    const launcher = `
      import fs from 'node:fs';
      import { createWorkflowCancellation } from ${JSON.stringify(moduleUrl('scripts/demo-e2e-workflow/cancellation.ts'))};
      import { runStep } from ${JSON.stringify(moduleUrl('scripts/demo-e2e-workflow/step.ts'))};
      const cancellation = createWorkflowCancellation();
      try {
        await runStep({ name: 'isolated cooperative watch', command: process.execPath, args: ['--import', 'tsx', '--input-type=module', '-e', ${JSON.stringify(watch)}] }, 1, 2, {}, { ...process.env, ...cancellation.env }, cancellation.signal);
      } catch (error) { fs.writeFileSync(${JSON.stringify(resultFile)}, JSON.stringify(error.stepReport)); }
      finally { await cancellation.dispose(); }
    `
    const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', launcher], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stderr?.on('data', (data) => {
      output += data
    })
    const done = closed(child)
    try {
      await vi.waitFor(async () => expect(await readFile(source, 'utf8'), output).toBe('mutated'), { timeout: 5000 })
      child.kill(signal)
      await vi.waitFor(async () => expect(JSON.parse(await readFile(resultFile, 'utf8'))).toMatchObject({ cancelled: signal }), { timeout: 5000 })
      expect(await readFile(source)).toEqual(sourceBytes)
      expect(await Promise.race([done.then(() => 'closed'), delay(3000, 'hung')])).toBe('closed')
      const report = JSON.parse(await readFile(resultFile, 'utf8'))
      expect(report.error).not.toContain('已向本轮进程发送终止请求')
      expect(report.sourceRestoration).toBe('unverified')
    }
    finally {
      for (const file of [leafPidFile, watchPidFile]) {
        stopKnown(Number(await readFile(file, 'utf8').catch(() => '0')))
      }
      stopKnown(child.pid)
      await done
      await rm(root, { recursive: true, force: true })
    }
  }, 15_000)

  it('父 close 后已登记的独立后代仍获得合作窗口，延迟恢复后退出', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'workflow-descendant-'))
    const source = path.join(root, 'source')
    const pidFile = path.join(root, 'descendant.pid')
    const cancel = path.join(root, 'cancel')
    const exit = path.join(root, 'exit-parent')
    const leaf = `const fs = require('node:fs'); fs.writeFileSync(${JSON.stringify(source)}, 'mutated'); const timer=setInterval(() => { if(fs.existsSync(${JSON.stringify(cancel)})) { clearInterval(timer); setTimeout(() => { fs.writeFileSync(${JSON.stringify(source)}, 'original'); process.exit(0); }, 200); } }, 10);`
    const launcher = `const fs=require('node:fs'); const child=require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(leaf)}], { detached: process.platform!=='win32', stdio:'ignore' }); fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid)); setInterval(()=>{if(fs.existsSync(${JSON.stringify(exit)}))process.exit(0)},10);`
    const child = spawn(process.execPath, ['-e', launcher], { detached: process.platform !== 'win32', stdio: 'ignore' })
    const done = closed(child)
    const tree = createWorkflowProcessTree(child, done, { cooperativeMs: 2000 })
    try {
      await vi.waitFor(async () => expect(await readFile(source, 'utf8')).toBe('mutated'))
      await tree.capture()
      await writeFile(exit, 'exit')
      await done
      const stopping = tree.stop(true)
      await writeFile(cancel, 'cancel')
      await stopping
      expect(await readFile(source, 'utf8')).toBe('original')
    }
    finally {
      stopKnown(Number(await readFile(pidFile, 'utf8').catch(() => '0')))
      stopKnown(child.pid)
      await done
      await rm(root, { recursive: true, force: true })
    }
  }, 10_000)
})
