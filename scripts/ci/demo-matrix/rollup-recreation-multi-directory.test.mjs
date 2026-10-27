import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestVariants } from './rollup-test-runtime.mjs'
import { getWatchPathEntry } from './rollup-watch-paths.mjs'
import { replaceSourceFile } from './source-file.mjs'

it.each(rollupTestVariants())('多个目录中的文件删除后仍恢复原生订阅 ($runtime, $version, $format)', async ({ require, format }) => {
  const dist = path.dirname(require.resolve('rollup'))
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'rollup-multiple-directory-recreation-')))
  const entry = path.join(root, 'entry.js')
  const dataDir = path.join(root, 'data')
  const data = path.join(dataDir, 'value.json')
  const events = []
  let task
  const platform = vi.spyOn(os, 'platform').mockReturnValue('win32')
  try {
    // 只选择 Rollup 的 Windows 分支；文件、stat 与订阅仍使用宿主真实 API。
    syncBuiltinESMExports()
    task = new Task({ invalidate: event => events.push({ ...event, id: path.normalize(event.id) }) }, {
      output: [],
      watch: { chokidar: { atomic: false, useFsEvents: false, usePolling: false } },
    })
    platform.mockRestore()
    syncBuiltinESMExports()
    const watcher = task.fileWatcher.watcher
    await mkdir(dataDir)
    await replaceSourceFile(entry, 'export default 0')
    await replaceSourceFile(data, '0')
    task.fileWatcher.watch(entry, false)
    task.fileWatcher.watch(data, true)
    await expect.poll(() => getWatchPathEntry(watcher._closers, data), { timeout: 5000 }).toBeDefined()
    expect(watcher._watched.size).toBeGreaterThan(1)
    await rm(data)
    await expect.poll(() => events, { timeout: 5000 }).toContainEqual({ id: data, event: 'delete' })
    events.length = 0
    await replaceSourceFile(data, '1')
    await expect.poll(() => events, { timeout: 5000 }).toContainEqual({ id: data, event: 'create' })
    expect(getWatchPathEntry(watcher._closers, data)).toHaveLength(1)
    events.length = 0
    await replaceSourceFile(data, '22')
    await expect.poll(() => events, { timeout: 5000 }).toContainEqual({ id: data, event: 'update' })
  }
  finally {
    platform.mockRestore()
    syncBuiltinESMExports()
    await task?.fileWatcher.watcher.close()
    await rm(root, { recursive: true, force: true })
  }
}, 15_000)
