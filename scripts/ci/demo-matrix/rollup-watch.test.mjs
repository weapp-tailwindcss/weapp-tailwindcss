import { mkdir, mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { rollupTestRequire } from './rollup-test-runtime.mjs'
import { replaceSourceFile } from './source-file.mjs'

const scenarios = ['uni-app-vite-tailwindcss-v4', 'issue-uview-plus-cssentries', 'taro-vite-react-tailwindcss-v4'].flatMap(demo =>
  ['cjs', 'esm'].flatMap(format => ['file', 'directory'].map(dependency => ({ demo, format, dependency }))),
)

it.each(scenarios)('keeps module and transform dependencies live after atomic replacement ($demo, $format, $dependency)', async ({ demo, format, dependency }) => {
  const viteRequire = rollupTestRequire(demo)
  const rollup = format === 'cjs'
    ? viteRequire('rollup')
    : await import(pathToFileURL(path.join(path.dirname(viteRequire.resolve('rollup')), 'es/rollup.js')).href)
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-transform-watch-')))
  const entry = path.join(dir, 'entry.js')
  const dataDir = path.join(dir, 'data')
  const data = path.join(dataDir, 'value.json')
  const output = path.join(dir, 'bundle.mjs')
  let watcher
  let builds = 0
  let errors = 0
  let inspection = 0
  try {
    await mkdir(dataDir)
    await replaceSourceFile(entry, 'export { default as value } from "./data/value.json"; export { default as derived } from "virtual:derived"')
    await replaceSourceFile(data, '{"value":0}')
    watcher = rollup.watch({
      input: entry,
      output: { file: output, format: 'es' },
      // Taro 使用原生句柄，避免目录级 fsevents 掩盖重复监听同一文件的问题。
      ...(demo.startsWith('taro-') ? { watch: { chokidar: { useFsEvents: false, usePolling: false } } } : {}),
      plugins: [{
        name: 'shared-transform-dependency',
        resolveId(id) { return id === 'virtual:derived' ? id : null },
        load(id) { return id === 'virtual:derived' ? 'export default null' : null },
        async transform(code, id) {
          if (id === data) {
            return `export default ${JSON.parse(code).value}`
          }
          if (id === 'virtual:derived') {
            this.addWatchFile(dependency === 'directory' ? dataDir : data)
            return `export default ${JSON.parse(await readFile(data, 'utf8')).value * 2}`
          }
        },
      }],
    })
    watcher.on('event', (event) => {
      if (event.code === 'BUNDLE_END') {
        builds++
        void event.result.close()
      }
      else if (event.code === 'ERROR') {
        errors++
      }
    })
    const inspect = async (value, previous) => {
      // 目录事件可能排队触发多次构建，计数增加不能证明本轮产物写完。
      await expect.poll(async () => {
        if (builds <= previous) {
          return undefined
        }
        const module = await import(`${pathToFileURL(output).href}?inspection=${++inspection}`)
        return { value: module.value, derived: module.derived }
      }, { timeout: 5000, interval: 1 }).toEqual({ value, derived: value * 2 })
    }
    await inspect(0, 0)
    for (const value of [1, 2, 3]) {
      const previous = builds
      await replaceSourceFile(data, JSON.stringify({ value }))
      await inspect(value, previous)
    }
    await rm(data)
    await expect.poll(() => errors, { timeout: 5000 }).toBeGreaterThan(0)
    const previous = builds
    await replaceSourceFile(data, '{"value":4}')
    await inspect(4, previous)
  }
  finally {
    await watcher?.close()
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)
