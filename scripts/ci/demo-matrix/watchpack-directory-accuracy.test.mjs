import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const webpackRequire = createRequire(require.resolve('webpack/package.json'))
const filename = webpackRequire.resolve('watchpack/lib/DirectoryWatcher')
const source = readFileSync(filename, 'utf8')
const watchpackRequire = createRequire(filename)

function createClock(platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix
  const directory = platform === 'win32' ? 'C:\\project' : '/project'
  const pending = []
  let now = 1200
  let precisionMtime
  const sandbox = {
    module: { exports: {} },
    require(id) {
      if (id === 'path') return paths
      if (id === 'os') return { platform: () => platform }
      if (id === 'graceful-fs') {
        return {
          lstat(_file, callback) {
            callback(null, { mtime: precisionMtime, isDirectory: () => false, isFile: () => true, isSymbolicLink: () => false })
          },
        }
      }
      return watchpackRequire(id)
    },
    process: { env: {}, nextTick(callback) { pending.push(callback) } },
    Date: class extends Date { static now() { return now } },
    console,
    setTimeout,
    clearTimeout,
  }
  runInNewContext(source, sandbox, { filename })
  class ControlledDirectoryWatcher extends sandbox.module.exports {
    // 时钟用例只驱动真实事件与重挂载方法，不启动宿主系统的文件监听。
    createWatcher() {}
    doScan() {}
  }
  const owner = new ControlledDirectoryWatcher({}, directory)
  owner.initialScan = false
  owner.initialScanFinished = now
  const watchers = []
  function flush() {
    while (pending.length) pending.shift()()
  }
  function watch(file, startTime) {
    const events = []
    const watcher = owner.watch(file, startTime)
    watchers.push(watcher)
    watcher.on('change', (...args) => events.push({ type: 'change', args }))
    watcher.on('remove', (...args) => events.push({ type: 'remove', args }))
    flush()
    return { watcher, events }
  }
  return {
    owner,
    directory,
    target: paths.join(directory, 'source'),
    setNow(value) { now = value },
    watch,
    learnAccuracy(mtime) {
      precisionMtime = mtime
      // 经 onWatchEvent → lstat → ensureFsAccuracy 的真实路径学习精度。
      owner.onWatchEvent('change', 'precision.js')
      flush()
    },
    close() {
      flush()
      watchers.forEach(watcher => watcher.close())
      owner.close()
    },
  }
}

for (const platform of ['linux', 'win32']) {
  describe(`Watchpack 目录时间精度：${platform}`, () => {
    it('初始目录的精度余量收敛后，连续快速重挂载不再重复失效', () => {
      const clock = createClock(platform)
      try {
        clock.owner.setDirectory(clock.target, 1000, true, 'scan (dir)')
        expect(clock.watch(clock.target, 1100).events).toEqual([{ type: 'change', args: [3000, 'watch (outdated on attach)', true] }])
        clock.learnAccuracy(1001)
        for (const startTime of [1500, 1800, 2100]) {
          clock.setNow(startTime + 100)
          expect(clock.watch(clock.target, startTime).events).toEqual([])
        }
      }
      finally {
        clock.close()
      }
    })

    it('逐轮减去原精度并加上新精度，仍保留尚未消除的时间余量', () => {
      const clock = createClock(platform)
      try {
        clock.owner.setDirectory(clock.target, 1000, true, 'scan (dir)')
        for (const [mtime, startTime, safeTime] of [[1100, 1900, 2000], [1110, 1090, 1100], [1111, 1005, 1010], [1111.5, 1000.5, 1001]]) {
          clock.learnAccuracy(mtime)
          expect(clock.watch(clock.target, startTime).events).toEqual([{ type: 'change', args: [safeTime, 'watch (outdated on attach)', true] }])
          expect(clock.watch(clock.target, safeTime + 1).events).toEqual([])
        }
        // 后续粗粒度样本不能重新放大已确认的精度余量。
        clock.learnAccuracy(2000)
        expect(clock.watch(clock.target, 1002).events).toEqual([])
      }
      finally {
        clock.close()
      }
    })

    it('未来的目录 birthtime 仍以观察时刻为上限，不能改成当前文件 mtime', () => {
      const clock = createClock(platform)
      try {
        clock.owner.setDirectory(clock.target, 5000, true, 'scan (dir)')
        clock.learnAccuracy(1001)
        expect(clock.watch(clock.target, 1205).events).toEqual([{ type: 'change', args: [1210, 'watch (outdated on attach)', true] }])
        expect(clock.watch(clock.target, 1211).events).toEqual([])
      }
      finally {
        clock.close()
      }
    })

    it('真实新增、删除和恢复的安全时间不随精度收敛而消失', () => {
      const clock = createClock(platform)
      try {
        clock.owner.setDirectory(clock.target, 1000, true, 'scan (dir)')
        clock.learnAccuracy(1001)
        const existing = clock.watch(clock.target, 1300)
        existing.events.length = 0
        clock.setNow(1400)
        clock.owner.setMissing(clock.target, false, 'physical deletion')
        expect(existing.events).toEqual([{ type: 'remove', args: ['physical deletion'] }])
        clock.owner.setDirectory(clock.target, 1000, false, 'physical recovery')
        expect(existing.events.at(-1)).toEqual({ type: 'change', args: [1000, 'physical recovery'] })
        clock.learnAccuracy(1111.5)
        expect(clock.watch(clock.target, 1390).events).toEqual([{ type: 'change', args: [1400, 'watch (outdated on attach)', true] }])
        expect(clock.watch(clock.target, 1401).events).toEqual([])
        // 内部等待目录出现的监听器不重复报告已经存在的目录。
        expect(clock.watch(clock.target, 1).events).toEqual([])
      }
      finally {
        clock.close()
      }
    })

    it('目录内容的真实文件 mtime 变化仍通过目录监听传播', () => {
      const clock = createClock(platform)
      try {
        const context = clock.watch(clock.directory, 1100)
        const file = (platform === 'win32' ? path.win32 : path.posix).join(clock.directory, 'physical.js')
        clock.setNow(1400)
        clock.owner.setFileTime(file, 1300, false, false, 'physical change')
        expect(context.events).toEqual([{ type: 'change', args: [file, 1400, 'physical change', false] }])
        clock.setNow(1500)
        clock.owner.setMissing(file, false, 'physical deletion')
        expect(context.events.at(-1)).toEqual({ type: 'change', args: [file, null, 'physical deletion', false] })
      }
      finally {
        clock.close()
      }
    })
  })
}
