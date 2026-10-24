import { createRequire } from 'node:module'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { repo } from './catalog.mjs'
import { rollupTestRequire } from './rollup-test-runtime.mjs'

const debugRequire = createRequire(path.join(repo, 'packages', 'debug-uni-app-x', 'package.json'))
const runtimes = [
  ...['uni-app-vite-tailwindcss-v4', 'issue-uview-plus-cssentries', 'taro-vite-react-tailwindcss-v4'].map(runtime => ({
    runtime,
    require: rollupTestRequire(runtime),
  })),
  { runtime: 'debug-uni-app-x', require: createRequire(debugRequire.resolve('vite/package.json')) },
]
const spellings = [
  ['C:\\repo\\value.json', 'C:/repo/value.json'],
  ['\\\\server\\share\\value.json', '//server/share/value.json'],
  ['\\repo\\value.json', '/repo/value.json'],
  ['repo\\value.json', 'repo/value.json'],
]
const scenarios = runtimes.flatMap(runtime => ['cjs', 'esm'].flatMap(format => spellings.flatMap(([native, portable]) =>
  [native, portable].flatMap(closeWith => ['closeFile', 'unwatch'].map(operation => ({ ...runtime, format, native, portable, closeWith, operation }))),
)))

it.each(scenarios)('Chokidar 登记与释放共用路径身份 ($runtime, $format, $native, $closeWith, $operation)', async ({ require, format, native, portable, closeWith, operation }) => {
  const dist = path.dirname(require.resolve('rollup'))
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const task = new Task({ invalidate() {} }, {
    output: [],
    watch: { chokidar: { useFsEvents: false, usePolling: false } },
  })
  const watcher = task.fileWatcher.watcher
  const first = vi.fn()
  const second = vi.fn()
  const unrelated = vi.fn()
  try {
    // 直接调用实际 bundled Chokidar，不依赖宿主操作系统能创建 Windows 路径。
    watcher._addPathCloser(native, first)
    watcher._addPathCloser(portable, second)
    watcher._addPathCloser('D:/other/value.json', unrelated)
    expect(watcher._closers.size).toBe(2)
    if (operation === 'unwatch') {
      watcher.unwatch(closeWith)
    }
    else {
      watcher._closeFile(closeWith)
    }
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(unrelated).not.toHaveBeenCalled()
    watcher._closeFile(native)
    watcher._closeFile(portable)
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenCalledTimes(1)
    expect(watcher._closers.size).toBe(1)
    await watcher.close()
    expect(unrelated).toHaveBeenCalledTimes(1)
    expect(watcher._closers.size).toBe(0)
  }
  finally { await watcher.close() }
})
