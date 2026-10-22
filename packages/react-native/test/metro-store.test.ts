import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compileNativeStylesheet } from '../src/compiler'
import { readPublishedManifest, readPublishedSnapshot, writeManifestFile } from '../src/metro/manifest-store'

let root: string
beforeEach(() => root = fs.mkdtempSync(path.join(os.tmpdir(), 'rn-store-')))
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
  fs.rmSync(root, { recursive: true, force: true })
})

it('worker 读取跨越发布轮次时必须重新读取一致版本', async () => {
  const file = path.join(root, 'manifest.json')
  const ready = path.join(root, 'manifest.ready')
  const before = compileNativeStylesheet('.probe { opacity: 0.5 }')
  const after = compileNativeStylesheet('.probe { opacity: 1 }')
  const publication = (revision: string, manifest: typeof before) => JSON.stringify({ revision, virtualPath: path.join(root, 'virtual.js'), manifestSha256: createHash('sha256').update(JSON.stringify(manifest)).digest('hex') })
  fs.writeFileSync(file, JSON.stringify(before))
  fs.writeFileSync(ready, publication('first', before))
  const read = fs.promises.readFile.bind(fs.promises)
  let changed = false
  vi.spyOn(fs.promises, 'readFile').mockImplementation((async (...args: Parameters<typeof read>) => {
    const content = await read(...args)
    if (args[0] === file && !changed) {
      changed = true
      writeManifestFile(file, JSON.stringify(after))
      writeManifestFile(ready, publication('second', after))
    }
    return content
  }) as typeof read)
  expect(await readPublishedManifest(file, ready)).toEqual(after)
})

it('ready 长期缺失时失败，不能在超时后悄悄使用旧 manifest', async () => {
  const file = path.join(root, 'manifest.json')
  const ready = path.join(root, 'manifest.ready')
  fs.writeFileSync(file, JSON.stringify(compileNativeStylesheet('.probe { opacity: 0.5 }')))
  const started = Date.now()
  vi.spyOn(Date, 'now').mockReturnValueOnce(started).mockReturnValue(started + 120_001)
  await expect(readPublishedManifest(file, ready)).rejects.toThrow('等待 React Native manifest 超时')
})

it('所属读取已取消时不返回完整旧文件，ready 轮询取消后也不再排定 timer', async () => {
  const file = path.join(root, 'manifest.json')
  const ready = path.join(root, 'manifest.ready')
  fs.writeFileSync(file, JSON.stringify(compileNativeStylesheet('.probe { opacity: 0.5 }')))
  const reason = new Error('snapshot owner closed')
  const already = new AbortController()
  already.abort(reason)
  await expect(readPublishedSnapshot(file, undefined, already.signal)).rejects.toBe(reason)
  const controller = new AbortController()
  const read = fs.promises.readFile.bind(fs.promises)
  const started = Date.now()
  vi.spyOn(Date, 'now').mockReturnValueOnce(started).mockReturnValueOnce(started).mockReturnValue(started + 120_001)
  vi.spyOn(fs.promises, 'readFile').mockImplementation((async (...args: Parameters<typeof read>) => {
    try {
      return await read(...args)
    }
    catch (error) {
      controller.abort(reason)
      throw error
    }
  }) as typeof read)
  await expect(readPublishedSnapshot(file, ready, controller.signal)).rejects.toMatchObject({ name: 'AbortError', cause: reason })
})

it.each([undefined, new Error('owner cancelled'), null, 0, false, ''])('没有 throwIfAborted 方法时仍原样保留取消原因（%s）', async (reason) => {
  const controller = new AbortController()
  controller.abort(reason)
  const expected = controller.signal.reason
  Object.defineProperty(controller.signal, 'throwIfAborted', { value: undefined })
  const read = vi.spyOn(fs.promises, 'readFile')
  await expect(readPublishedSnapshot(path.join(root, 'manifest.json'), undefined, controller.signal)).rejects.toBe(expected)
  expect(read).not.toHaveBeenCalled()
})

it('旧信号没有 reason 时以 AbortError 拒绝，不能调用不存在的方法或开始读取', async () => {
  // 模拟旧宿主仅提供事件与 aborted 的信号；生产代码不能依赖扩展方法。
  const signal = Object.assign(new EventTarget(), { aborted: true, onabort: null }) as AbortSignal
  const read = vi.spyOn(fs.promises, 'readFile')
  await expect(readPublishedSnapshot(path.join(root, 'manifest.json'), undefined, signal)).rejects.toMatchObject({ name: 'AbortError' })
  expect(read).not.toHaveBeenCalled()
})

it('发布失败保留上一份完整文件，且释放本轮临时文件', () => {
  const file = path.join(root, 'manifest.json')
  fs.writeFileSync(file, 'previous')
  vi.spyOn(fs, 'renameSync').mockImplementationOnce(() => {
    throw new Error('disk failure')
  })
  expect(() => writeManifestFile(file, 'next')).toThrow('disk failure')
  expect(fs.readFileSync(file, 'utf8')).toBe('previous')
  expect(fs.readdirSync(root)).toEqual(['manifest.json'])
})

it('成功发布后只保留最终文件，不留下 Metro 可见的临时资源', () => {
  const file = path.join(root, 'virtual.js')
  writeManifestFile(file, 'first')
  writeManifestFile(file, 'second')
  expect(fs.readFileSync(file, 'utf8')).toBe('second')
  expect(fs.readdirSync(root)).toEqual(['virtual.js'])
})
