import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
import { isOwnershipSourceRegistered, prepareOwnershipSource } from './rollup-ownership-readiness.mjs'
import { rollupTestRequire } from './rollup-test-runtime.mjs'
import { getWatchPathEntry } from './rollup-watch-paths.mjs'

it('真实叶子订阅已登记不能放行仍在首次扫描且尚未绑定目录的 owner', async () => {
  const require = rollupTestRequire('uni-app-vite-tailwindcss-v4')
  const { Task } = await import(pathToFileURL(path.join(path.dirname(require.resolve('rollup')), 'es/shared/watch.js')))
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'rollup-owner-readiness-')))
  const directory = path.join(root, 'data')
  const file = path.join(directory, 'value.js')
  const task = new Task({ invalidate() {} }, { output: [], watch: { chokidar: { useFsEvents: false, usePolling: false } } })
  const watcher = task.fileWatcher.watcher
  const handler = watcher._nodeFsHandler
  const original = handler._handleRead
  const scanFinished = Promise.withResolvers()
  const releaseScan = Promise.withResolvers()
  handler._handleRead = async function (target, initialAdd, ...args) {
    const result = await original.call(this, target, initialAdd, ...args)
    if (path.resolve(target) === directory && initialAdd) {
      // 真实扫描已启动真实叶子订阅；只控制目录扫描返回和后续目录绑定之间的边界。
      scanFinished.resolve()
      await releaseScan.promise
    }
    return result
  }
  try {
    await mkdir(directory)
    await writeFile(file, '0')
    task.updateWatchedFiles({ watchFiles: [], cache: { modules: [{ id: 'virtual:owner', originalCode: 'valid', transformDependencies: [directory] }] } })
    await scanFinished.promise
    await expect.poll(() => Boolean(getWatchPathEntry(watcher._closers, file)), { timeout: 5000 }).toBe(true)
    expect(getWatchPathEntry(watcher._closers, directory)).toBeUndefined()
    // 旧 ready(child) 此时已经成功；不能把它当成新 owner 的生命周期握手。
    expect(isOwnershipSourceRegistered(task, file, directory)).toBe(false)
    releaseScan.resolve()
    await expect.poll(() => isOwnershipSourceRegistered(task, file, directory), { timeout: 5000 }).toBe(true)
  }
  finally {
    releaseScan.resolve()
    handler._handleRead = original
    await task.close()
    await rm(root, { recursive: true, force: true })
  }
})

function handshakeFixture(options = {}) {
  const directory = path.join(os.tmpdir(), 'ownership-handshake')
  const file = path.join(directory, 'value.js')
  const watcher = { _closers: new Map([[directory, [() => {}]], [file, [() => {}]]]), _streams: new Set(), _throttled: new Map() }
  const task = { fileWatcher: { fileGroups: new Map([[directory, { watcher }]]) } }
  const sources = []
  const published = []
  const received = []
  let elapsed = 0
  let drained = !options.pending
  const input = {
    task,
    file,
    owner: directory,
    sources,
    timeoutMs: 10,
    now: () => elapsed,
    async pause() {
      elapsed++
      for (const receipt of received.splice(0)) {
        if (receipt.readyAt <= elapsed) {
          sources.push(receipt.source)
        }
        else {
          received.push(receipt)
        }
      }
      if (elapsed === 3 && !options.neverDrain) {
        watcher._throttled.clear()
        drained = true
      }
    },
    readStat: async () => ({ atime: new Date(0), mtimeMs: 1000 }),
    async publish(_, mtime) {
      published.push(mtime)
      if ((options.dropFirst && published.length === 1) || (options.onlyFirst && published.length > 1)) {
        return
      }
      const source = { watcher, file, event: 'update', stats: { mtimeMs: mtime }, ...options.source }
      if (options.receiptLag) {
        // 每次 stat 都先取得旧快照，再在后续事件循环返回，不能被新 probe 改写。
        received.push({ readyAt: elapsed + options.receiptLag, source })
      }
      else {
        sources.push(source)
      }
      if (options.pending) {
        watcher._throttled.set('watch', new Map([[file, {}]]))
      }
    },
    isDrained: () => drained,
  }
  return { input, published, elapsed: () => elapsed }
}

it('首个原生 probe 尚未被监听采集时必须获得后续目标回执，并排空已接收任务', async () => {
  const { input, published, elapsed } = handshakeFixture({ dropFirst: true, pending: true })
  await prepareOwnershipSource(input)
  expect(published).toEqual([2000, 3000])
  expect(elapsed()).toBe(3)
})

it('连续慢 stat 回执不能因持续追逐最新 probe 而饥饿，确认已发回执后停止写入', async () => {
  const { input, published, elapsed } = handshakeFixture({ receiptLag: 2 })
  await prepareOwnershipSource(input)
  expect(published).toEqual([2000, 3000])
  expect(input.sources.map(source => source.stats.mtimeMs)).toEqual([2000, 3000])
  expect(elapsed()).toBe(3)
})

it('较早 probe 已确认但最后发布始终无回执时不能追加写入或放行', async () => {
  const { input, published } = handshakeFixture({ receiptLag: 2, onlyFirst: true })
  await expect(prepareOwnershipSource(input)).rejects.toThrow('source-final-acknowledgement')
  expect(published).toEqual([2000, 3000])
  expect(input.sources.map(source => source.stats.mtimeMs)).toEqual([2000])
})

it.each([
  { file: path.join(os.tmpdir(), 'unrelated.js') },
  { event: 'create' },
  { watcher: {} },
  { stats: { mtimeMs: 1000 } },
])('兄弟文件、旧 owner、旧采样或 create 不能代替目标原生握手（%j）', async (source) => {
  const { input } = handshakeFixture({ source })
  await expect(prepareOwnershipSource(input)).rejects.toThrow('source-acknowledgement')
})

it('有目标回执但已接收任务始终未排空时不能清空 probe 通知并放行', async () => {
  const { input, published } = handshakeFixture({ pending: true, neverDrain: true })
  await expect(prepareOwnershipSource(input)).rejects.toThrow('source-drain')
  expect(published).toEqual([2000])
})
