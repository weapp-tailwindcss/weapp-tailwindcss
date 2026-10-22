import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { compileNativeStylesheet } from '../src/compiler'
import { getRegisteredManifest, getRegisteredSnapshot, getRegisteredSnapshotByPath, getRegisteredSnapshotByProjectRoot, getRegisteredVirtualModule, VIRTUAL_MANIFEST_MODULE, withWeappTailwindcss } from '../src/metro'
import { readPublishedSnapshot } from '../src/metro/manifest-store'
import { registry } from '../src/metro/registry'

const roots: string[] = []
const files: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) { fs.rmSync(root, { recursive: true, force: true }) }
  for (const file of files.splice(0)) { fs.rmSync(file, { force: true }) }
})

function directory() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-publication-'))
  roots.push(root)
  return root
}

it('bootstrap 写入失败不能留下已注册但从未发布的入口', () => {
  const root = directory()
  const before = registry.size
  vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('bootstrap disk failure') })
  expect(() => withWeappTailwindcss({}, { projectRoot: root, css: '.probe { opacity: 0.5 }' })).toThrow('bootstrap disk failure')
  expect(registry.size).toBe(before)
})

it('同项目新入口的 bootstrap 失败不能撤销原入口已成功发布的 ready', async () => {
  const item = await registered()
  const ready = fs.readFileSync(item.entry.manifestReadyPath, 'utf8')
  const manifest = fs.readFileSync(item.entry.manifestPath, 'utf8')
  const size = registry.size
  vi.spyOn(fs, 'renameSync').mockImplementation(() => { throw new Error('bootstrap disk failure') })
  expect(() => withWeappTailwindcss({}, item.options)).toThrow('bootstrap disk failure')
  expect(registry.size).toBe(size)
  expect(fs.readFileSync(item.entry.manifestReadyPath, 'utf8')).toBe(ready)
  expect(fs.readFileSync(item.entry.manifestPath, 'utf8')).toBe(manifest)
  await expect(getRegisteredManifest(item.id)).resolves.toEqual(item.entry.manifest)
})

async function registered() {
  const options = { projectRoot: directory(), manifest: compileNativeStylesheet('.probe { opacity: 0.5 }') }
  const config = withWeappTailwindcss({}, options)
  const virtual = config.resolver!.resolveRequest!({}, VIRTUAL_MANIFEST_MODULE, 'ios') as { filePath: string }
  const entry = getRegisteredVirtualModule(virtual.filePath)!
  files.push(entry.manifestPath, entry.manifestReadyPath)
  await entry.ready
  vi.spyOn(console, 'error').mockImplementation(() => {})
  return { entry, options, id: config.transformer!.weappTailwindcssMetroId as string }
}

it('读取者等待期间启动新一轮刷新时，继续等该轮完整 snapshot', async () => {
  const item = await registered()
  const version = item.entry.version
  item.options.manifest = compileNativeStylesheet('.probe { opacity: 1 }')
  queueMicrotask(() => { void item.entry.refresh() })
  const reading = getRegisteredSnapshot(item.id)
  const snapshot = await reading
  expect(snapshot?.version).toBe(version + 1)
  expect(snapshot?.manifest).toEqual(item.options.manifest)
})

it('公开入口是只读实时视图，不能替换内部 snapshot 或 ready', async () => {
  const item = await registered()
  const original = item.entry.snapshot
  expect(() => Object.assign(item.entry, { snapshot: { ...original, manifestJson: '{}' } })).toThrow(TypeError)
  expect(() => Object.assign(item.entry, { ready: Promise.resolve() })).toThrow(TypeError)
  item.options.manifest = compileNativeStylesheet('.probe { opacity: 1 }')
  await item.entry.refresh()
  expect(item.entry.snapshot).not.toBe(original)
  expect(Object.isFrozen(item.entry.snapshot)).toBe(true)
  expect(Object.isFrozen(item.entry.snapshot.manifest)).toBe(true)
  expect(item.entry.snapshot.publication?.manifestSha256).toBe(createHash('sha256').update(item.entry.snapshot.manifestJson).digest('hex'))
})

it('进程内项目和文件查询统一选择最近完整发布，显式 ID 保持其注册身份', async () => {
  const first = await registered()
  const original = await getRegisteredSnapshot(first.id)
  const config = withWeappTailwindcss({}, { ...first.options, manifest: compileNativeStylesheet('.probe { opacity: 1 }') })
  const latest = await getRegisteredSnapshot(config.transformer!.weappTailwindcssMetroId as string)
  expect(latest?.publication?.revision).not.toBe(original?.publication?.revision)
  expect(await getRegisteredSnapshotByPath(first.entry.manifestPath)).toBe(latest)
  expect(await getRegisteredSnapshotByProjectRoot(first.entry.projectRoot)).toBe(latest)
  expect(await getRegisteredSnapshot(first.id)).toBe(original)
})

it('错误标记也无法写入时保留原始发布错误，不能回退成旧成功', async () => {
  const item = await registered()
  const original = item.entry.snapshot
  const rename = fs.renameSync.bind(fs)
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === item.entry.virtualPath) { throw new Error('original virtual failure') }
    if (to === item.entry.manifestReadyPath) { throw new Error('error marker failure') }
    return rename(from, to)
  })
  const error = await item.entry.refresh().catch(error => error)
  expect(error).toBeInstanceOf(AggregateError)
  expect(error.cause.message).toBe('original virtual failure')
  expect(error.errors.map((item: Error) => item.message)).toEqual(['original virtual failure', 'error marker failure'])
  expect(item.entry.snapshot).toBe(original)
  await expect(getRegisteredSnapshot(item.id)).rejects.toThrow('original virtual failure')
})

it.each(['virtualPath', 'manifestPath', 'manifestReadyPath'] as const)('%s 写入失败不能发布新内存状态，下一次保存可恢复', async (key) => {
  const item = await registered()
  const before = item.entry.manifest
  const version = item.entry.version
  item.options.manifest = compileNativeStylesheet('.probe { opacity: 1 }')
  const rename = fs.renameSync.bind(fs)
  let failed = false
  vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === item.entry[key] && !failed) {
      failed = true
      throw new Error(`${key} disk failure`)
    }
    return rename(from, to)
  })
  await expect(item.entry.refresh()).rejects.toThrow(`${key} disk failure`)
  expect(item.entry.manifest).toEqual(before)
  expect(item.entry.version).toBe(version)
  await expect(getRegisteredManifest(item.id)).rejects.toThrow(`${key} disk failure`)
  await item.entry.refresh()
  expect(item.entry.version).toBe(version + 1)
  expect(await getRegisteredManifest(item.id)).toEqual(item.options.manifest)
})

it('撤销旧 ready 失败必须属于本轮 ready，读取者不能沿用旧成功', async () => {
  const item = await registered()
  const remove = fs.rmSync.bind(fs)
  let failed = false
  vi.spyOn(fs, 'rmSync').mockImplementation((file, options) => {
    if (file === item.entry.manifestReadyPath && !failed) {
      failed = true
      throw new Error('pending disk failure')
    }
    return remove(file, options)
  })
  await expect(Promise.resolve().then(() => item.entry.refresh())).rejects.toThrow('pending disk failure')
  await expect(getRegisteredManifest(item.id)).rejects.toThrow('pending disk failure')
})

it('worker 拒绝身份相同但 manifest 字节摘要不匹配的产物', async () => {
  const root = directory()
  const filename = path.join(root, 'manifest.json')
  const ready = path.join(root, 'manifest.ready')
  const original = JSON.stringify(compileNativeStylesheet('.probe { opacity: 0.5 }'))
  fs.writeFileSync(filename, JSON.stringify(compileNativeStylesheet('.probe { opacity: 1 }')))
  fs.writeFileSync(ready, JSON.stringify({ revision: 'current', virtualPath: path.join(root, 'virtual.js'), manifestSha256: createHash('sha256').update(original).digest('hex') }))
  await expect(readPublishedSnapshot(filename, ready)).rejects.toThrow('摘要')
})

it('worker 先传递发布错误，不尝试读取错误轮次缺失的 manifest', async () => {
  const root = directory()
  const filename = path.join(root, 'absent.json')
  const ready = path.join(root, 'manifest.ready')
  fs.writeFileSync(ready, JSON.stringify({ error: 'original compile failure' }))
  const read = fs.promises.readFile.bind(fs.promises)
  vi.spyOn(fs.promises, 'readFile').mockImplementation((async (...args: Parameters<typeof read>) => {
    if (args[0] === filename) { throw new Error('读取了错误轮次的 manifest') }
    return read(...args)
  }) as typeof read)
  await expect(readPublishedSnapshot(filename, ready)).rejects.toThrow('original compile failure')
})

it('只有数字的历史 ready 不得伪装成有身份的成功发布', async () => {
  const root = directory()
  const filename = path.join(root, 'manifest.json')
  const ready = path.join(root, 'manifest.ready')
  fs.writeFileSync(filename, JSON.stringify(compileNativeStylesheet('.probe { opacity: 0.5 }')))
  fs.writeFileSync(ready, '1\n')
  await expect(readPublishedSnapshot(filename, ready)).rejects.toThrow('发布身份')
})
