import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'
import { createNativeSessionRecovery } from '../scripts/hbuilderx-native-session'

const roots: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

it('未知停止跨新实例、运行目录及平台阻止下一次源码写入', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'native-persistent-'))
  roots.push(root)
  await fs.mkdir(path.join(root, '.git'))
  const cli = path.join(root, 'cli')
  const file = path.join(root, 'App.uvue')
  await fs.writeFile(cli, 'test installation')
  await fs.writeFile(file, 'original')
  const options = {
    directory: path.join(root, 'first-evidence'),
    projectRoot: root,
    platform: 'app-harmony',
    host: { path: cli, host: 'test-host', version: '5.31' },
    files: [{ file }],
  }
  const first = await createNativeSessionRecovery(options)
  await first.beginMutation()
  await fs.writeFile(file, 'frozen first session')
  await expect(first.cleanup({
    stop: async () => { throw new Error('native stop unknown') },
    nativeStopReason: () => undefined,
    afterStop: () => {},
    safe: [],
    release: [],
  })).rejects.toThrow('停止未确认')
  const next = async () => {
    const second = await createNativeSessionRecovery({ ...options, directory: path.join(root, 'new-evidence'), platform: 'app-ios', host: { ...options.host, version: '5.32' } })
    await second.beginMutation()
    await fs.writeFile(file, 'unsafe second session')
  }
  await expect(next()).rejects.toThrow('未解除')
  expect(await fs.readFile(file, 'utf8')).toBe('frozen first session')
  const entry = new URL('../scripts/hbuilderx-native-session.ts', import.meta.url).href
  const childOptions = { ...options, directory: path.join(root, 'child-evidence'), platform: 'app-android' }
  const script = `
    import { createNativeSessionRecovery } from ${JSON.stringify(entry)};
    import fs from 'node:fs/promises';
    try {
      const recovery = await createNativeSessionRecovery(${JSON.stringify(childOptions)});
      await recovery.beginMutation();
      await fs.writeFile(${JSON.stringify(file)}, 'unsafe fresh process');
    } catch (error) {
      console.error(String(error));
      process.exitCode = String(error).includes('未解除') ? 17 : 18;
    }
  `
  // 真正新进程不能依赖 Vitest 模块缓存或当前对象的 blocked 状态。
  await expect(promisify(execFile)(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', script], { cwd: process.cwd(), timeout: 10_000 })).rejects.toMatchObject({ code: 17, stderr: expect.stringContaining('未解除') })
  expect(await fs.readFile(file, 'utf8')).toBe('frozen first session')
})
