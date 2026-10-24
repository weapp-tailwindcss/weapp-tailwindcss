import { EventEmitter } from 'node:events'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestVariants } from './rollup-test-runtime.mjs'

it.each(rollupTestVariants())('扫描 error/close 只释放等待，完整 end 才确认文件删除 ($version, $format)', async ({ require, format }) => {
  const dist = path.dirname(require.resolve('rollup'))
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const task = new Task({ invalidate() {} }, { output: [], watch: { chokidar: { useFsEvents: false } } })
  const watcher = task.fileWatcher.watcher
  const directory = path.join(os.tmpdir(), 'rollup-directory-read-error')
  const tracked = watcher._getWatchedDir(directory)
  tracked.add('existing.js')
  const stream = new EventEmitter()
  const failure = Object.assign(new Error('incomplete directory read'), { code: 'EIO' })
  const errors = []
  watcher.on('error', error => errors.push(error))
  vi.spyOn(watcher, '_readdirp').mockReturnValue(stream)
  const removed = vi.spyOn(watcher, '_remove').mockImplementation(() => {})
  const helpers = watcher._getWatchHelpers(directory)
  try {
    const interrupted = watcher._nodeFsHandler._handleRead(directory, false, helpers, undefined, directory, 0)
    stream.emit('error', failure)
    stream.emit('close')
    await interrupted
    expect(errors).toEqual([failure])
    expect(removed).not.toHaveBeenCalled()
    expect(tracked.has('existing.js')).toBe(true)
    const complete = watcher._nodeFsHandler._handleRead(directory, false, helpers, undefined, directory, 0)
    stream.emit('end')
    await complete
    expect(removed).toHaveBeenCalledExactlyOnceWith(directory, 'existing.js')
  }
  finally { await task.close() }
})
