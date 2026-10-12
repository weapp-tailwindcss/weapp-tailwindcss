import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestRequire } from './rollup-test-runtime.mjs'

const scenarios = ['uni-app-vite-tailwindcss-v4', 'issue-uview-plus-cssentries', 'taro-vite-react-tailwindcss-v4'].flatMap(demo =>
  ['cjs', 'esm'].flatMap(format => ['file', 'directory'].flatMap(dependency => [false, true].map(accessed => ({ demo, format, dependency, accessed })))),
)

it.each(scenarios)('$demo / $format / $dependency / atime=$accessed：polling 保留等长且 mtime 不变的真实文件替换', async ({ demo, format, dependency, accessed }) => {
  const require = rollupTestRequire(demo)
  const dist = path.dirname(require.resolve('rollup'))
  const rollup = format === 'cjs' ? require('rollup') : await import(pathToFileURL(path.join(dist, 'es/rollup.js')).href)
  const { Task } = format === 'cjs' ? require(path.join(dist, 'shared/watch.js')) : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-polling-identity-')))
  const dataDir = path.join(root, 'data')
  const data = path.join(dataDir, 'value.json')
  const staged = path.join(root, 'replacement.json')
  const entry = path.join(root, 'entry.js')
  const output = path.join(root, 'bundle.mjs')
  const fixed = new Date('2000-01-01T00:00:00Z')
  const atime = accessed ? new Date(fixed.getTime() + 60_000) : fixed
  const raw = []
  const changes = []
  const invalidated = []
  let fsWatcher
  let watcher
  let inspection = 0
  const run = Task.prototype.run
  const observe = vi.spyOn(Task.prototype, 'run').mockImplementation(function (...args) {
    if (!fsWatcher) {
      fsWatcher = this.fileWatcher.watcher
      fsWatcher.on('raw', (_event, file, details) => {
        if (path.resolve(file) === data && details.curr) {
          raw.push({ curr: details.curr, prev: details.prev })
        }
      })
      fsWatcher.on('change', file => changes.push(path.resolve(file)))
    }
    return run.apply(this, args)
  })
  try {
    await mkdir(dataDir)
    await writeFile(entry, 'export { default } from "virtual:derived"')
    await writeFile(data, '{"value":0}')
    await utimes(data, fixed, fixed)
    // 新文件先在受监视目录外准备，不让临时文件事件替代目标文件的真实变化。
    await writeFile(staged, '{"value":3}')
    await utimes(staged, atime, fixed)
    const before = await stat(data)
    watcher = rollup.watch({
      input: entry,
      output: { file: output, format: 'es' },
      watch: { chokidar: { usePolling: true, interval: 10 }, onInvalidate(id) { invalidated.push(id) } },
      plugins: [{
        name: 'polling-transform-dependency',
        resolveId(id) { return id === 'virtual:derived' ? id : null },
        load(id) { return id === 'virtual:derived' ? 'export default null' : null },
        async transform(_, id) {
          if (id === 'virtual:derived') {
            this.addWatchFile(dependency === 'directory' ? dataDir : data)
            return `export default ${JSON.parse(await readFile(data, 'utf8')).value * 2}`
          }
        },
      }],
    })
    watcher.on('event', (event) => {
      void event.result?.close()
    })
    const inspect = value => expect.poll(async () => {
      const module = await import(`${pathToFileURL(output).href}?inspection=${++inspection}`)
      return module.default
    }, { timeout: 5000, interval: 1 }).toBe(value)
    await inspect(0)
    await expect.poll(() => fsWatcher?._readyEmitted, { timeout: 5000, interval: 1 }).toBe(true)
    await rename(staged, data)
    const after = await stat(data)
    expect(after.size).toBe(before.size)
    expect(after.mtimeMs).toBe(before.mtimeMs)
    expect(after.atimeMs).toBe(atime.getTime())
    expect(after.ino).not.toBe(before.ino)
    await expect.poll(() => raw.some(({ curr, prev }) => curr.ino === after.ino && curr.ino !== prev.ino
      && curr.size === prev.size && curr.mtimeMs === prev.mtimeMs && curr.atimeMs === atime.getTime()), { timeout: 5000, interval: 1 }).toBe(true)
    // raw 已收到不同 inode；接下来的 change 与真实构建不能被前置 stat 过滤吞掉。
    await expect.poll(() => changes, { timeout: 5000, interval: 1 }).toContain(data)
    if (!demo.startsWith('taro-')) {
      expect(invalidated).toContain(dependency === 'directory' ? dataDir : data)
    }
    await inspect(6)
  }
  finally {
    try {
      await watcher?.close()
    }
    finally {
      observe.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  }
}, 15_000)
