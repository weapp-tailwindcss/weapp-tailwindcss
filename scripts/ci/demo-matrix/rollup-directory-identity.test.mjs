import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { rollupTestVariants } from './rollup-test-runtime.mjs'

const identities = [
  { name: 'POSIX', paths: path.posix, cwd: '/workspace', normalized: '/workspace/data' },
  { name: 'POSIX 根目录', paths: path.posix, cwd: '/workspace', normalized: '/' },
  { name: 'POSIX 相对路径', paths: path.posix, cwd: '/workspace', normalized: 'data' },
  { name: 'Windows 盘符', paths: path.win32, cwd: 'C:\\workspace', normalized: 'C:/workspace/data' },
  { name: 'Windows 盘符根目录', paths: path.win32, cwd: 'C:\\workspace', normalized: 'C:/' },
  { name: 'Windows 根相对路径', paths: path.win32, cwd: 'C:\\workspace', normalized: '/data' },
  { name: 'Windows 相对路径', paths: path.win32, cwd: 'C:\\workspace', normalized: 'data' },
  { name: 'Windows UNC', paths: path.win32, cwd: 'C:\\workspace', normalized: '//server/share/data' },
]

const cases = rollupTestVariants().flatMap(runtime => identities.map(identity => ({ ...runtime, ...identity })))

it.each(cases)('真实 unwatch 按目录登记的宿主身份撤销整个子树 ($version, $format, $name)', async ({ require, format, name, paths, cwd, normalized }) => {
  const dist = path.dirname(require.resolve('rollup'))
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const task = new Task({ invalidate() {} }, { output: [], watch: { chokidar: { useFsEvents: false, cwd } } })
  const watcher = task.fileWatcher.watcher
  const resolve = (...segments) => paths.resolve(cwd, ...segments)
  const directory = resolve(normalized)
  watcher._watched.set(directory, { dispose() {} })
  const closePath = vi.spyOn(watcher, '_closePath').mockImplementation(() => {})
  const closeRecreation = vi.spyOn(watcher, '_closeRecreation').mockImplementation(() => {})
  // 执行实际解析版本的方法，仅固定宿主 path 与 unifyPaths 的已规范化输出。
  // 这里验证目录身份；相邻门控回归继续验证真实原生发现及句柄释放。
  const unwatch = runInNewContext(`({ ${watcher.unwatch.toString()} }).unwatch`, {
    sysPath: { ...paths, resolve },
    unifyPaths: () => [normalized],
    SLASH_GLOBSTAR: '/**',
  })
  try {
    unwatch.call(watcher, normalized)
    expect(closePath, name).toHaveBeenCalledOnce()
    expect(closeRecreation, name).toHaveBeenCalledOnce()
    const retired = closePath.mock.calls[0][0]
    expect(watcher._ignoredPaths, name).toEqual(new Set([retired, `${retired}/**`]))
  }
  finally {
    closePath.mockRestore()
    closeRecreation.mockRestore()
    await task.close()
  }
})
