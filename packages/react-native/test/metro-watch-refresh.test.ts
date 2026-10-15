import type { FSWatcher, WatchListener } from 'node:fs'
import type { MetroConfigLike } from '../src/metro'
import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compileNativeStylesheet } from '../src/compiler'
import { getRegisteredManifest, getRegisteredVirtualModule, VIRTUAL_MANIFEST_MODULE, withWeappTailwindcss } from '../src/metro'
import { readPublishedManifest } from '../src/metro/manifest-store'
import { createNativeStyleRuntime } from '../src/runtime'

const { generate } = vi.hoisted(() => ({ generate: vi.fn() }))
vi.mock('../src/tailwind', () => ({ generateNativeStylesheet: generate }))

it('没有原生通知时，连续保存仍刷新并发布 Metro manifest', async ({ onTestFinished }) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-watch-refresh-'))
  const input = path.join(root, 'style.css')
  fs.writeFileSync(input, '.probe { background-color: #10b981 }')
  const watchers: FSWatcher[] = []
  vi.spyOn(fs, 'watch').mockImplementation(((_root: string, _options: unknown, listener: WatchListener<string>) => {
    const watcher = new EventEmitter() as FSWatcher
    watcher.close = () => {
      watcher.emit('close')
    }
    watcher.on('change', listener)
    watchers.push(watcher)
    return watcher
  }) as typeof fs.watch)
  let compiled: (() => void) | undefined
  generate.mockImplementation(async () => {
    const manifest = compileNativeStylesheet(await fs.promises.readFile(input, 'utf8'))
    compiled?.()
    return manifest
  })
  const config = withWeappTailwindcss({}, { projectRoot: root, input }) as MetroConfigLike
  const virtual = config.resolver!.resolveRequest!({}, VIRTUAL_MANIFEST_MODULE, 'ios') as { filePath: string }
  const entry = getRegisteredVirtualModule(virtual.filePath)!
  const id = config.transformer!.weappTailwindcssMetroId as string
  onTestFinished(async () => {
    compiled = undefined
    for (const watcher of watchers) {
      watcher.close()
    }
    await entry.ready.catch(() => {})
    vi.restoreAllMocks()
    generate.mockReset()
    fs.rmSync(root, { recursive: true, force: true })
    fs.rmSync(entry.manifestPath, { force: true })
    fs.rmSync(entry.manifestReadyPath, { force: true })
  })
  await entry.ready
  for (const color of ['#f59e0b', '#3b82f6']) {
    const nextCompilation = new Promise<void>((resolve) => {
      compiled = resolve
    })
    const temporary = path.join(root, 'save.tmp')
    fs.writeFileSync(temporary, `.probe { background-color: ${color} }`)
    fs.renameSync(temporary, input)
    await nextCompilation
    expect(createNativeStyleRuntime(await getRegisteredManifest(id)).tw('probe')).toEqual({ backgroundColor: color })
    expect(await readPublishedManifest(entry.manifestPath, entry.manifestReadyPath)).toEqual(entry.manifest)
  }
  expect(entry.version).toBe(3)
})
