import type { FSWatcher, WatchListener } from 'node:fs'
import type { MetroConfigLike } from '../src/metro'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compileNativeStylesheet } from '../src/compiler'
import { getRegisteredManifest, getRegisteredVirtualModule, VIRTUAL_MANIFEST_MODULE, withWeappTailwindcss } from '../src/metro'
import { readPublishedManifest } from '../src/metro/manifest-store'
import { createNativeStyleRuntime } from '../src/runtime'

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('../src/tailwind', () => ({ generateNativeStylesheet: generate }))

async function fixture(prepare?: () => void, waitForReady = true) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-refresh-'))
  const input = path.join(root, 'style.css')
  fs.writeFileSync(input, '.probe { background-color: #10b981 }')
  let changed: WatchListener<string> | undefined
  vi.spyOn(fs, 'watch').mockImplementation(((_file: string, _options: unknown, listener: WatchListener<string>) => {
    changed = listener
    return { close() {} } as FSWatcher
  }) as typeof fs.watch)
  generate.mockImplementation(async () => compileNativeStylesheet(await fs.promises.readFile(input, 'utf8')))
  prepare?.()
  const config = withWeappTailwindcss({}, { projectRoot: root, input }) as MetroConfigLike
  const virtual = config.resolver!.resolveRequest!({}, VIRTUAL_MANIFEST_MODULE, 'ios') as { filePath: string }
  const entry = getRegisteredVirtualModule(virtual.filePath)!
  if (waitForReady) {
    await entry.ready
  }
  return {
    input,
    entry,
    id: config.transformer!.weappTailwindcssMetroId as string,
    change: () => changed!('change', path.basename(input)),
    async cleanup() {
      await entry.ready.catch(() => {})
      vi.restoreAllMocks()
      fs.rmSync(root, { recursive: true, force: true })
      fs.rmSync(entry.manifestPath, { force: true })
      fs.rmSync(entry.manifestReadyPath, { force: true })
    },
  }
}

afterEach(() => generate.mockReset())

it('编译期间输入恢复后必须重新生成，即使没有第二次 watch 通知', async () => {
  const item = await fixture()
  let compiled!: () => void
  let release!: () => void
  const captured = new Promise<void>(resolve => compiled = resolve)
  const gate = new Promise<void>(resolve => release = resolve)
  try {
    generate.mockImplementationOnce(async () => {
      const manifest = compileNativeStylesheet(await fs.promises.readFile(item.input, 'utf8'))
      compiled()
      await gate
      return manifest
    })
    fs.writeFileSync(item.input, '')
    item.change()
    await captured
    // 保存完成不再通知 watcher，验证发布前必须重新核对编译输入。
    fs.writeFileSync(item.input, '.probe { background-color: #f59e0b }')
    release()
    await vi.waitFor(() => expect(item.entry.version).toBeGreaterThan(1))
    expect(createNativeStyleRuntime(item.entry.manifest).tw('probe')).toEqual({ backgroundColor: '#f59e0b' })
  }
  finally {
    release()
    await item.cleanup()
  }
})

it('当前刷新未完成时，读取者等待本轮 manifest 而不是初次 ready', async () => {
  const item = await fixture()
  let release!: () => void
  const gate = new Promise<void>(resolve => release = resolve)
  let reading: ReturnType<typeof getRegisteredManifest> | undefined
  try {
    generate.mockImplementation(async () => {
      await gate
      return compileNativeStylesheet('.probe { background-color: #f59e0b }')
    })
    item.change()
    let settled = false
    reading = getRegisteredManifest(item.id).then((value) => {
      settled = true
      return value
    })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(settled).toBe(false)
    release()
    expect(createNativeStyleRuntime(await reading).tw('probe')).toEqual({ backgroundColor: '#f59e0b' })
  }
  finally {
    release()
    await reading
    await item.cleanup()
  }
})

it('真实清空 CSS 仍发布空样式，不保留旧规则伪装更新成功', async () => {
  const item = await fixture()
  try {
    fs.writeFileSync(item.input, '')
    item.change()
    await vi.waitFor(() => expect(item.entry.version).toBeGreaterThan(1))
    expect(createNativeStyleRuntime(item.entry.manifest).tw('probe')).toEqual({})
  }
  finally {
    await item.cleanup()
  }
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(complete => resolve = complete)
  return { promise, resolve }
}

it('读取者等待期间切换到新一轮时，只能读取最新轮次', async () => {
  const item = await fixture()
  const first = deferred()
  const firstStarted = deferred()
  const second = deferred()
  const secondStarted = deferred()
  let oldRefresh: Promise<void> | undefined
  let reading: ReturnType<typeof getRegisteredManifest> | undefined
  try {
    generate.mockImplementationOnce(async () => {
      firstStarted.resolve()
      await first.promise
      return compileNativeStylesheet('.probe { background-color: #ff0000 }')
    }).mockImplementationOnce(async () => {
      secondStarted.resolve()
      await second.promise
      return compileNativeStylesheet('.probe { background-color: #f59e0b }')
    })
    oldRefresh = item.entry.refresh()
    await firstStarted.promise
    let settled = false
    reading = getRegisteredManifest(item.id).then((value) => {
      settled = true
      return value
    })
    item.change()
    await secondStarted.promise
    first.resolve()
    await oldRefresh
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(fs.existsSync(item.entry.manifestReadyPath)).toBe(false)
    second.resolve()
    expect(createNativeStyleRuntime(await reading).tw('probe')).toEqual({ backgroundColor: '#f59e0b' })
    expect(item.entry.version).toBe(2)
  }
  finally {
    first.resolve()
    second.resolve()
    await oldRefresh
    await reading
    await item.cleanup()
  }
})

it('旧轮次迟到完成不能覆盖已发布的新轮次', async () => {
  const item = await fixture()
  const started = deferred()
  const finish = deferred()
  let oldRefresh: Promise<void> | undefined
  try {
    generate.mockImplementationOnce(async () => {
      started.resolve()
      await finish.promise
      return compileNativeStylesheet('.probe { background-color: #ff0000 }')
    })
    oldRefresh = item.entry.refresh()
    await started.promise
    fs.writeFileSync(item.input, '.probe { background-color: #f59e0b }')
    await item.entry.refresh()
    finish.resolve()
    await oldRefresh
    expect(createNativeStyleRuntime(item.entry.manifest).tw('probe')).toEqual({ backgroundColor: '#f59e0b' })
    expect(item.entry.version).toBe(2)
    expect(await readPublishedManifest(item.entry.manifestPath, item.entry.manifestReadyPath)).toEqual(item.entry.manifest)
  }
  finally {
    finish.resolve()
    await oldRefresh
    await item.cleanup()
  }
})

it('首次编译的迟到失败不能提前放行仍在运行的新轮次', async () => {
  const first = deferred()
  const firstStarted = deferred()
  const second = deferred()
  const secondStarted = deferred()
  const item = await fixture(() => {
    generate.mockImplementationOnce(async () => {
      firstStarted.resolve()
      await first.promise
      throw new Error('obsolete initial compilation')
    })
  }, false)
  const initial = item.entry.ready
  try {
    await firstStarted.promise
    generate.mockImplementationOnce(async () => {
      secondStarted.resolve()
      await second.promise
      return compileNativeStylesheet('.probe { background-color: #f59e0b }')
    })
    item.change()
    await secondStarted.promise
    first.resolve()
    await initial
    expect(fs.existsSync(item.entry.manifestReadyPath)).toBe(false)
    expect(item.entry.version).toBe(0)
    second.resolve()
    await item.entry.ready
    expect(createNativeStyleRuntime(item.entry.manifest).tw('probe')).toEqual({ backgroundColor: '#f59e0b' })
  }
  finally {
    first.resolve()
    second.resolve()
    await initial
    await item.cleanup()
  }
})

it('当前轮次编译失败必须传递给读取者和 worker，并允许下次保存恢复', async () => {
  const item = await fixture()
  const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    generate.mockRejectedValueOnce(new Error('invalid CSS source'))
    item.change()
    await expect(getRegisteredManifest(item.id)).rejects.toThrow('invalid CSS source')
    await expect(readPublishedManifest(item.entry.manifestPath, item.entry.manifestReadyPath)).rejects.toThrow('invalid CSS source')
    expect(item.entry.version).toBe(1)
    expect(logged).toHaveBeenCalledOnce()
    fs.writeFileSync(item.input, '.probe { background-color: #f59e0b }')
    await item.entry.refresh()
    expect(createNativeStyleRuntime(await getRegisteredManifest(item.id)).tw('probe')).toEqual({ backgroundColor: '#f59e0b' })
    expect(await readPublishedManifest(item.entry.manifestPath, item.entry.manifestReadyPath)).toEqual(item.entry.manifest)
  }
  finally {
    await item.cleanup()
  }
})

it('持续变化的输入有界失败，不能发布某次偶然采样或无限重试', async () => {
  const item = await fixture()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    let iteration = 0
    generate.mockImplementation(async () => {
      const css = await fs.promises.readFile(item.input, 'utf8')
      fs.writeFileSync(item.input, `.probe { opacity: ${++iteration / 10} }`)
      return compileNativeStylesheet(css)
    })
    await expect(item.entry.refresh()).rejects.toThrow('5 次稳定性检查')
    expect(iteration).toBe(5)
    expect(item.entry.version).toBe(1)
    expect(createNativeStyleRuntime(item.entry.manifest).tw('probe')).toEqual({ backgroundColor: '#10b981' })
  }
  finally {
    await item.cleanup()
  }
})
