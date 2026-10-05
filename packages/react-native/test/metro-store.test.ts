import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { compileNativeStylesheet } from '../src/compiler'
import { readPublishedManifest, writeManifestFile } from '../src/metro/manifest-store'

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
  fs.writeFileSync(file, JSON.stringify(before))
  fs.writeFileSync(ready, '1\n')
  const read = fs.promises.readFile.bind(fs.promises)
  let changed = false
  vi.spyOn(fs.promises, 'readFile').mockImplementation((async (...args: Parameters<typeof read>) => {
    const content = await read(...args)
    if (args[0] === file && !changed) {
      changed = true
      writeManifestFile(file, JSON.stringify(after))
      writeManifestFile(ready, '2\n')
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
