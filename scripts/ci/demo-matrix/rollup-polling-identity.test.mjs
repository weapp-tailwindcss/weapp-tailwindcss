import { mkdir, mkdtemp, readFile, realpath, rename, rm, stat, utimes, writeFile } from 'node:fs/promises'
import { syncBuiltinESMExports } from 'node:module'
import os, { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { assertPublishedIdentity, captureIdentity } from './rollup-file-identity/fixture.mjs'
import { preparePollingBaseline } from './rollup-polling-readiness.mjs'
import { hasPollingReplacementReceipt } from './rollup-polling-receipt.mjs'
import { rollupTestRequire } from './rollup-test-runtime.mjs'
import { getWatchPathEntry } from './rollup-watch-paths.mjs'

const scenarios = ['uni-app-vite-tailwindcss-v4', 'issue-uview-plus-cssentries', 'taro-vite-react-tailwindcss-v4'].flatMap(demo =>
  ['cjs', 'esm'].flatMap(format => ['file', 'directory'].flatMap(dependency => [false, true].map(accessed => ({ demo, format, dependency, accessed, delayed: false })))),
)
scenarios.push({ demo: 'taro-vite-react-tailwindcss-v4', format: 'cjs', dependency: 'directory', accessed: false, delayed: true })
for (const demo of ['uni-app-vite-tailwindcss-v4', 'issue-uview-plus-cssentries']) {
  for (const format of ['cjs', 'esm']) {
    scenarios.push({ demo, format, dependency: 'directory', accessed: true, delayed: false, platform: 'linux' })
  }
}

it.each(scenarios)('$demo / $format / $dependency / atime=$accessed / delayed=$delayed / platform=$platform：polling 保留等长且 mtime 不变的真实文件替换', async ({ demo, format, dependency, accessed, delayed, platform }) => {
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
  const initial = new Date(fixed.getTime() - 1000)
  const atime = accessed ? new Date(fixed.getTime() + 60_000) : fixed
  const raw = []
  const changes = []
  const invalidated = []
  const fields = ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']
  const state = stats => Object.fromEntries([...fields, 'atimeMs'].map(key => [key, stats[key]]))
  let replacement
  let fsWatcher
  let task
  let watcher
  let registration
  let releaseRegistration
  let releaseTimer
  let platformSpy
  const registrationGate = new Promise((resolve) => {
    releaseRegistration = resolve
  })
  let inspection = 0
  const run = Task.prototype.run
  const observe = vi.spyOn(Task.prototype, 'run').mockImplementation(function (...args) {
    if (!fsWatcher) {
      task = this
      fsWatcher = this.fileWatcher.watcher
      if (delayed) {
        const handler = fsWatcher._nodeFsHandler
        const add = handler._addToNodeFs
        registration = vi.spyOn(handler, '_addToNodeFs').mockImplementation(async function (file, ...args) {
          if (path.resolve(file) === data) {
            await registrationGate
          }
          return add.call(this, file, ...args)
        })
      }
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
    await writeFile(entry, 'export { default, observedMtime } from "virtual:derived"')
    await writeFile(data, '{"value":0}')
    await utimes(data, fixed, initial)
    // 新文件先在受监视目录外准备，不让临时文件事件替代目标文件的真实变化。
    await writeFile(staged, '{"value":3}')
    await utimes(staged, atime, fixed)
    if (platform) {
      // 跨系统执行 Linux 的 Rollup 分支，原生 polling、raw 和实际 bundle 均不替换。
      platformSpy = vi.spyOn(os, 'platform').mockReturnValue(platform)
      syncBuiltinESMExports()
    }
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
            const value = JSON.parse(await readFile(data, 'utf8')).value
            const observed = await stat(data)
            return `export default ${value * 2}; export const observedMtime = ${observed.mtimeMs}`
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
    platformSpy?.mockRestore()
    syncBuiltinESMExports()
    await expect.poll(() => fsWatcher?._readyEmitted, { timeout: 5000, interval: 1 }).toBe(true)
    if (delayed) {
      // 只在故障注入中延迟叶子文件订阅，证明全局 ready 不能作为目标文件的握手。
      expect([...(fsWatcher._closers ?? [])].some(([file]) => path.resolve(file) === data)).toBe(false)
      releaseTimer = setTimeout(releaseRegistration, 50)
    }
    // ready 只属于首次扫描；目录依赖必须等到目标叶子的实际订阅已登记。
    await expect.poll(() => [...(fsWatcher?._closers ?? [])]
      .some(([file, closers]) => path.resolve(file) === data && closers.length > 0), { timeout: 5000, interval: 1 }).toBe(true)
    // Node 没有首次 polling 采样的 ready 事件；预热回执不能作为最终替换证据。
    await preparePollingBaseline({
      raw,
      initialTime: initial.getTime(),
      fixedTime: fixed.getTime(),
      publish: time => utimes(data, fixed, new Date(time)),
      readOutput: () => import(`${pathToFileURL(output).href}?inspection=${++inspection}`),
      isIdle: () => !task.invalidated && !task.watcher.running && !task.watcher.rerun
        && task.watcher.buildTimeout === null && task.watcher.invalidatedIds.size === 0
        && !getWatchPathEntry(fsWatcher._throttled.get('watch') ?? [], data),
    })
    const before = await stat(data)
    const beforeIdentity = captureIdentity(data)
    const stagedIdentity = captureIdentity(staged)
    expect(stagedIdentity.exact).not.toEqual(beforeIdentity.exact)
    // 发布前证明输入 atime；rename 后真实构建读取可能立即推进它。
    expect((await stat(staged)).atimeMs).toBe(atime.getTime())
    const rawOffset = raw.length
    const changeOffset = changes.length
    const invalidationOffset = invalidated.length
    await rename(staged, data)
    const after = await stat(data)
    const publishedIdentity = captureIdentity(data)
    replacement = { before: state(before), after: state(after), identities: { before: beforeIdentity, staged: stagedIdentity, published: publishedIdentity }, rawOffset, changeOffset, invalidationOffset }
    assertPublishedIdentity(beforeIdentity.exact, stagedIdentity.exact, publishedIdentity.exact)
    expect(after.size).toBe(before.size)
    expect(after.mtimeMs).toBe(before.mtimeMs)
    // Number inode 可能碰撞；BigInt 发布身份、连续 raw 与真实构建产物共同证明替换。
    await expect.poll(async () => {
      const result = await import(`${pathToFileURL(output).href}?inspection=${++inspection}`)
      return {
        matched: hasPollingReplacementReceipt({
          before,
          after,
          identities: replacement.identities,
          raw,
          rawOffset,
          output: result,
          expectedOutput: 6,
        }),
        before: state(before),
        after: state(after),
        identities: replacement.identities,
        raw: raw.slice(rawOffset).map(({ curr, prev }) => ({ curr: state(curr), prev: state(prev) })),
        output: { value: result.default, observedMtime: result.observedMtime },
      }
    }, { timeout: 5000, interval: 1 }).toMatchObject({ matched: true })
    // raw 已收到本次替换；接下来的 change 与真实构建不能被前置 stat 过滤吞掉。
    await expect.poll(() => changes.slice(changeOffset), { timeout: 5000, interval: 1 }).toContain(data)
    if (!demo.startsWith('taro-')) {
      expect(invalidated.slice(invalidationOffset)).toContain(dependency === 'directory' ? dataDir : data)
    }
    await inspect(6)
  }
  catch (error) {
    throw new Error(`${String(error)}\nPolling identity trace: ${JSON.stringify({ demo, format, dependency, accessed, delayed, platform, replacement, raw: raw.slice(-40).map(({ curr, prev }) => ({ curr: state(curr), prev: state(prev) })), changes, invalidated })}`, { cause: error })
  }
  finally {
    platformSpy?.mockRestore()
    syncBuiltinESMExports()
    clearTimeout(releaseTimer)
    releaseRegistration()
    try {
      await watcher?.close()
    }
    finally {
      registration?.mockRestore()
      observe.mockRestore()
      await rm(root, { recursive: true, force: true })
    }
  }
}, 15_000)
