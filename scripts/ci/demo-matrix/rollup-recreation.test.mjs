import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { rollupTestRequire } from './rollup-test-runtime.mjs'
import { getWatchPathEntry } from './rollup-watch-paths.mjs'
import { replaceSourceFile } from './source-file.mjs'

const require = rollupTestRequire('taro-vite-react-tailwindcss-v4')
const dist = path.dirname(require.resolve('rollup'))
const scenarios = ['cjs', 'esm'].flatMap(format =>
  [true, false].flatMap(atomic => ['file', 'parent'].flatMap(barrier =>
    ['file', 'directory'].map(dependency => ({ format, atomic, barrier, dependency })))),
)

it.each(scenarios)('reconciles a dependency recreated during native subscription ($format, atomic=$atomic, $barrier, $dependency)', async ({ format, atomic, barrier, dependency }) => {
  const rollup = format === 'cjs'
    ? require('rollup')
    : await import(pathToFileURL(path.join(dist, 'es/rollup.js')).href)
  const { Task } = format === 'cjs'
    ? require(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-recreation-')))
  const entry = path.join(dir, 'entry.js')
  const dataDir = path.join(dir, 'data')
  const data = path.join(dataDir, 'value.json')
  const output = path.join(dir, 'bundle.mjs')
  const release = Promise.withResolvers()
  let task
  let blocked = false
  let errors = 0
  let inspection = 0
  let watcher
  let registration
  const run = Task.prototype.run
  const observer = vi.spyOn(Task.prototype, 'run').mockImplementation(function (...args) {
    task = this
    return run.apply(this, args)
  })
  try {
    await mkdir(dataDir)
    await replaceSourceFile(entry, 'export { default as value } from "./data/value.json"; export { default as derived } from "virtual:derived"')
    await replaceSourceFile(data, '{"value":0}')
    watcher = rollup.watch({
      input: entry,
      output: { file: output, format: 'es' },
      watch: { chokidar: { useFsEvents: false, usePolling: false, atomic } },
      plugins: [{
        name: 'recreated-transform-dependency',
        resolveId(id) { return id === 'virtual:derived' ? id : null },
        load(id) { return id === 'virtual:derived' ? 'export default null' : null },
        async transform(_, id) {
          if (id === data) {
            return `export default ${JSON.parse(await readFile(data, 'utf8')).value}`
          }
          if (id === 'virtual:derived') {
            this.addWatchFile(dependency === 'file' ? data : dataDir)
            return `export default ${JSON.parse(await readFile(data, 'utf8')).value * 2}`
          }
        },
      }],
    })
    watcher.on('event', (event) => {
      void event.result?.close()
      if (event.code === 'ERROR') {
        errors++
      }
    })
    const inspect = value => expect.poll(async () => {
      try {
        const module = await import(`${pathToFileURL(output).href}?inspection=${++inspection}`)
        return { value: module.value, derived: module.derived }
      }
      catch { return undefined }
    }, { timeout: 5000, interval: 1 }).toEqual({ value, derived: value * 2 })
    await inspect(0)
    const fsWatcher = task.fileWatcher.watcher
    await expect.poll(() => getWatchPathEntry(fsWatcher._closers, data), { timeout: 5000 }).toBeDefined()
    expect(fsWatcher._watched.size).toBeGreaterThan(1)
    const handler = fsWatcher._nodeFsHandler
    const add = handler._addToNodeFs
    // 只延后真实订阅，不注入文件事件；控制重建发生在 stat 或父目录绑定之前。
    registration = vi.spyOn(handler, '_addToNodeFs').mockImplementation(async function (file, ...args) {
      if (barrier === 'file' ? path.resolve(file) === data : path.resolve(file) === dataDir && args[3] === path.basename(data)) {
        blocked = true
        await release.promise
      }
      return add.call(this, file, ...args)
    })
    await rm(data)
    await expect.poll(() => errors, { timeout: 5000 }).toBeGreaterThan(0)
    await expect.poll(() => blocked, { timeout: 5000 }).toBe(true)
    await replaceSourceFile(data, '{"value":4}')
    release.resolve()
    await inspect(4)
    // 对账不能只触发一次构建；新 inode 的后续保存仍要让两个模块同时失效。
    await replaceSourceFile(data, '{"value":5}')
    await inspect(5)
  }
  finally {
    release.resolve()
    await watcher?.close()
    registration?.mockRestore()
    observer.mockRestore()
    await rm(dir, { recursive: true, force: true })
  }
}, 20_000)
