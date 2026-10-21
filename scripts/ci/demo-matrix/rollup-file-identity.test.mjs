import fs from 'node:fs'
import { mkdtemp, readFile, realpath, rm, stat } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it, vi } from 'vitest'
import { repo } from './catalog.mjs'
import { assertPublishedIdentity, captureIdentity, exactIdentity, publishDistinctSourceFile } from './rollup-file-identity/fixture.mjs'
import { replaceSourceFile } from './source-file.mjs'

it('Taro Rollup 去重窗口保留不同文件状态，仅合并相同状态通知', async () => {
  const demoRequire = createRequire(path.join(repo, 'demo/taro-vite-react-tailwindcss-v4/package.json'))
  const viteRequire = createRequire(demoRequire.resolve('vite/package.json'))
  const { chokidar } = viteRequire(path.join(path.dirname(viteRequire.resolve('rollup')), 'shared/index.js'))
  const watcher = chokidar.watch([], { ignoreInitial: true })
  const file = path.join(tmpdir(), 'rollup3-change-probe.js')
  const events = []
  watcher.on('change', (_, stats) => events.push(stats))
  const initial = { dev: 1, ino: 1, size: 10, mtimeMs: 1, ctimeMs: 1 }
  try {
    await watcher._emit('change', file, initial)
    await watcher._emit('change', file, { ...initial })
    expect(events).toEqual([initial])
    for (const key of ['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs']) {
      const changed = { ...events.at(-1), [key]: events.at(-1)[key] + 1 }
      await watcher._emit('change', file, changed)
      expect(events.at(-1)).toEqual(changed)
      const count = events.length
      await watcher._emit('change', file, { ...changed })
      expect(events).toHaveLength(count)
    }
    expect(events).toHaveLength(6)
  }
  finally { await watcher.close() }
})

it('Taro 原生监听节流后读取窗口内最后一次文件状态', async () => {
  const demoRequire = createRequire(path.join(repo, 'demo/taro-vite-react-tailwindcss-v4/package.json'))
  const viteRequire = createRequire(demoRequire.resolve('vite/package.json'))
  const { chokidar } = viteRequire(path.join(path.dirname(viteRequire.resolve('rollup')), 'shared/index.js'))
  const watcher = chokidar.watch([], { ignoreInitial: true, useFsEvents: false, usePolling: false })
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-throttle-')))
  const file = path.join(dir, 'value.js')
  const events = []
  let listener
  const bind = vi.spyOn(watcher._nodeFsHandler, '_watchWithNodeFs').mockImplementation((_, callback) => {
    listener = callback
    return () => {}
  })
  watcher.on('change', (_, stats) => events.push(stats.size))
  try {
    await replaceSourceFile(file, '0')
    const initial = await stat(file)
    watcher._nodeFsHandler._handleFile(file, initial, true)
    watcher._getWatchedDir(dir).add(path.basename(file))
    vi.useFakeTimers()
    await listener(file, { ...initial, size: 2, mtimeMs: initial.mtimeMs + 1 })
    await replaceSourceFile(file, '333')
    await listener(file)
    await listener(file)
    expect(events).toEqual([2])
    await vi.advanceTimersByTimeAsync(5)
    vi.useRealTimers()
    await expect.poll(() => events, { timeout: 1000 }).toEqual([2, 3])
  }
  finally {
    vi.useRealTimers()
    bind.mockRestore()
    await watcher.close()
    await rm(dir, { recursive: true, force: true })
  }
})

const rebindingCases = ['cjs', 'esm'].flatMap(format => ['relative', 'windows'].flatMap(style =>
  [false, true].map(changed => ({ format, style, changed })),
))

it.each(rebindingCases)('Taro 重绑使用注册身份 ($format, $style, 身份变化=$changed)', async ({ format, style, changed }) => {
  const demoRequire = createRequire(path.join(repo, 'demo/taro-vite-react-tailwindcss-v4/package.json'))
  const viteRequire = createRequire(demoRequire.resolve('vite/package.json'))
  const dist = path.dirname(viteRequire.resolve('rollup'))
  const { Task } = format === 'cjs'
    ? viteRequire(path.join(dist, 'shared/watch.js'))
    : await import(pathToFileURL(path.join(dist, 'es/shared/watch.js')).href)
  const task = new Task({ invalidate() {} }, { output: [], watch: { chokidar: { ignoreInitial: true, useFsEvents: false, usePolling: false } } })
  const watcher = task.fileWatcher.watcher
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-listener-key-')))
  const file = path.join(dir, 'value.js')
  const closers = []
  let listener
  const bind = vi.spyOn(watcher._nodeFsHandler, '_watchWithNodeFs').mockImplementation((_, callback) => {
    listener = callback
    const close = vi.fn()
    closers.push(close)
    return close
  })
  try {
    await replaceSourceFile(file, '0')
    const current = await stat(file)
    // 路径归属合同显式触发所需分支，不依赖宿主两次替换的 Number inode 必然不同。
    const previous = changed ? { ...current, ino: current.ino === 1 ? 2 : 1 } : current
    watcher._nodeFsHandler._handleFile(file, previous, true)
    // 目录广播携带平台原生路径，注册表则使用 Chokidar 的入口身份。
    const eventPath = style === 'relative' ? path.relative(process.cwd(), file) : path.win32.normalize(file)
    await listener(eventPath)
    expect(closers[0]).toHaveBeenCalledTimes(changed ? 1 : 0)
    expect(bind.mock.calls.map(([target]) => target)).toEqual(Array.from({ length: changed ? 2 : 1 }).fill(file))
    if (changed) {
      expect(closers[1]).not.toHaveBeenCalled()
    }
    expect([...watcher._closers.keys()].map(key => path.resolve(key))).toEqual([file])
    expect([...watcher._closers.values()].map(value => value.length)).toEqual([1])
    await watcher.close()
    expect(closers).toHaveLength(changed ? 2 : 1)
    for (const closer of closers) {
      expect(closer).toHaveBeenCalledTimes(1)
    }
    expect(watcher._closers.size).toBe(0)
  }
  finally {
    bind.mockRestore()
    await watcher.close()
    await rm(dir, { recursive: true, force: true })
  }
})

it('精确文件身份拒绝零 inode 和丢失精度的 Number 输入，设备零值仍合法', () => {
  expect(() => exactIdentity({ dev: 0n, ino: 0n })).toThrow('有效 inode')
  expect(() => exactIdentity({ dev: 0n, ino: 9007199254740992 })).toThrow('BigInt')
  expect(exactIdentity({ dev: 0n, ino: 9007199254740993n })).toEqual({ dev: '0', ino: '9007199254740993' })
})

it('真实发布证据拒绝身份未变或发布后指向其他文件，允许非相邻历史身份复用', () => {
  const first = { dev: '0', ino: '1' }
  const second = { dev: '0', ino: '2' }
  expect(() => assertPublishedIdentity(first, first, first)).toThrow('新旧文件')
  expect(() => assertPublishedIdentity(first, second, first)).toThrow('发布后的目标')
  expect(() => assertPublishedIdentity(second, first, first)).not.toThrow()
})

it('不同精确 inode 的 Number 碰撞不能否定真实替换，也不能接受旧文件冒充已发布文件', () => {
  const previous = { dev: 0n, ino: 9007199254740992n }
  const staged = { dev: 0n, ino: 9007199254740993n }
  expect(Number(previous.ino)).toBe(Number(staged.ino))
  const before = exactIdentity(previous)
  const replacement = exactIdentity(staged)
  expect(() => assertPublishedIdentity(before, replacement, replacement)).not.toThrow()
  expect(() => assertPublishedIdentity(before, replacement, before)).toThrow('发布后的目标')
})

it.each(['cjs', 'esm'].flatMap(format => [false, true].map(shared => ({ format, shared }))))('Taro Rollup 原生监听持续绑定当前文件身份 ($format, 共享依赖=$shared)', async ({ format, shared }) => {
  const demoRequire = createRequire(path.join(repo, 'demo/taro-vite-react-tailwindcss-v4/package.json'))
  const viteRequire = createRequire(demoRequire.resolve('vite/package.json'))
  const rollup = format === 'cjs'
    ? viteRequire('rollup')
    : await import(pathToFileURL(path.join(path.dirname(viteRequire.resolve('rollup')), 'es/rollup.js')).href)
  const dir = await realpath(await mkdtemp(path.join(tmpdir(), 'rollup-file-identity-')))
  const entry = path.join(dir, 'entry.js')
  const output = path.join(dir, 'bundle.mjs')
  const nativeWatch = fs.watch
  const bindings = new Map()
  const bindingEvents = []
  const watchSpy = vi.spyOn(fs, 'watch').mockImplementation((file, ...args) => {
    const native = nativeWatch(file, ...args)
    if (path.resolve(String(file)) === entry) {
      const identity = captureIdentity(entry)
      bindings.set(native, identity)
      bindingEvents.push({ action: 'bind', identity })
      native.once('close', () => {
        bindingEvents.push({ action: 'close', identity })
        bindings.delete(native)
      })
    }
    return native
  })
  let watcher
  let inspection = 0
  try {
    let receipt = await publishDistinctSourceFile(entry, 'export const value = 0')
    watcher = rollup.watch({
      input: shared ? 'virtual:entry' : entry,
      plugins: shared
        ? [{
            name: 'shared-file-identity',
            resolveId(id) { return id === 'virtual:entry' ? id : null },
            load(id) { return id === 'virtual:entry' ? `export { value } from ${JSON.stringify(entry)}` : null },
            transform(_, id) {
              if (id === 'virtual:entry') {
                this.addWatchFile(entry)
              }
            },
          }]
        : [],
      output: { file: output, format: 'es' },
      // 显式使用 fs.watch，避免 macOS 的目录级 fsevents 掩盖 Windows 文件句柄失效。
      watch: { chokidar: { useFsEvents: false, usePolling: false } },
    })
    watcher.on('event', event => event.result?.close())
    for (const value of [0, 1, 2, 3]) {
      if (value > 0) {
        receipt = await publishDistinctSourceFile(entry, `export const value = ${value}`)
      }
      await expect.poll(async () => {
        await readFile(output)
        const result = await import(`${pathToFileURL(output).href}?revision=${++inspection}`)
        return result.value
      }, { timeout: 5000 }).toBe(value)
      const current = captureIdentity(entry)
      expect(current.exact).toEqual(receipt.published.exact)
      // 只收到一次 change 不足以证明监听存活；原生句柄必须指向替换后的文件。
      await expect.poll(() => ({
        bound: [...bindings.values()].map(identity => identity.exact),
        receipt,
        bindingEvents: [...bindingEvents],
      }), { timeout: 5000 }).toMatchObject({ bound: [current.exact] })
    }
  }
  finally {
    await watcher?.close()
    watchSpy.mockRestore()
    await rm(dir, { recursive: true, force: true })
  }
}, 30_000)
