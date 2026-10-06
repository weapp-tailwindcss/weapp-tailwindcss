import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestRequire } from './rollup-test-runtime.mjs'

const require = rollupTestRequire('taro-vite-react-tailwindcss-v4')
const dist = path.dirname(require.resolve('rollup'))
const spellings = [
  ['C:\\repo\\value.json', 'C:/repo/value.json'],
  ['\\\\server\\share\\value.json', '//server/share/value.json'],
  ['\\repo\\value.json', '/repo/value.json'],
  ['repo\\value.json', 'repo/value.json'],
]
const scenarios = ['cjs', 'esm'].flatMap(format => spellings.flatMap(([native, portable]) =>
  [native, portable].map(closeWith => ({ format, native, portable, closeWith })),
))

it.each(scenarios)('Chokidar 登记与释放共用路径身份 ($format, $native, $closeWith)', async ({ format, native, portable, closeWith }) => {
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
    watcher._closeFile(closeWith)
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
