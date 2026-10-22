import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { brotliCompressSync, gzipSync } from 'node:zlib'
import { execa } from 'execa'
import { afterEach, describe, expect, it } from 'vitest'
import { downloadArchive, sha256, unpackArchive, validateArchivePath } from './lynx/decoder/rebuild/archives'
import { gnString } from './lynx/decoder/rebuild/gn'
import { linkPortableDecoder } from './lynx/decoder/rebuild/link'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx decoder source '))
  directories.push(directory)
  return directory
}

function tarFixture(entries: Array<{ name: string, type: '0' | '2' | 'x' | 'K', value: string }>) {
  const blocks: Buffer[] = []
  for (const entry of entries) {
    const header = Buffer.alloc(512)
    header.write(entry.name, 0, 100)
    header.write('0000644\0', 100, 8)
    const size = entry.type !== '2' ? Buffer.byteLength(entry.value) : 0
    header.write(`${size.toString(8).padStart(11, '0')}\0`, 124, 12)
    header.fill(32, 148, 156)
    header.write(entry.type, 156, 1)
    if (entry.type === '2') {
      header.write(entry.value, 157, 100)
    }
    header.write('ustar\0', 257, 6)
    const checksum = header.reduce((total, value) => total + value, 0)
    header.write(`${checksum.toString(8).padStart(6, '0')}\0 `, 148, 8)
    blocks.push(header)
    if (size) {
      const data = Buffer.alloc(Math.ceil(size / 512) * 512)
      data.write(entry.value)
      blocks.push(data)
    }
  }
  blocks.push(Buffer.alloc(1024))
  return Buffer.concat(blocks)
}

function paxLink(target: string) {
  const value = `linkpath=${target}\n`
  let record = `0 ${value}`
  while (Buffer.byteLength(record) !== Number.parseInt(record, 10)) {
    record = `${Buffer.byteLength(record)} ${value}`
  }
  return record
}

describe('Lynx decoder 源码归档边界', () => {
  it.each(['header', 'PAX', 'GNU'])('Windows tar 宿主归一化不能抹去 %s 链接中的反斜杠', async (format) => {
    const directory = await temporaryDirectory()
    const archive = path.join(directory, 'source.tar')
    const target = String.raw`..\outside`
    const entries: Parameters<typeof tarFixture>[0] = []
    if (format === 'PAX') {
      entries.push({ name: 'PaxHeader', type: 'x', value: paxLink(target) })
    }
    else if (format === 'GNU') {
      entries.push({ name: '././@LongLink', type: 'K', value: `${target}\0` })
    }
    entries.push({ name: 'source/include/header.h', type: '2', value: format === 'header' ? target : '../outside' })
    await fs.writeFile(archive, tarFixture(entries))
    const script = `
      import assert from 'node:assert/strict';
      const { unpackArchive } = await import(${JSON.stringify(new URL('./lynx/decoder/rebuild/archives.ts', import.meta.url).href)});
      await assert.rejects(unpackArchive(process.argv[1], process.argv[2], 1), /路径/);
    `
    await execa(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, archive, path.join(directory, 'unpacked')], {
      env: { TESTING_TAR_FAKE_PLATFORM: 'win32' },
      timeout: 10_000,
    })
  })

  it.each([
    ['gzip', 'PAX'],
    ['gzip', 'GNU'],
    ['brotli', 'PAX'],
    ['brotli', 'GNU'],
  ])('分块读取 %s 归档并物化合法 %s 相对链接', async (compression, format) => {
    const directory = await temporaryDirectory()
    const archive = path.join(directory, compression === 'gzip' ? 'source.tar.gz' : 'source.tar.br')
    const contents = Array.from({ length: 3000 }, (_, index) => sha256(Buffer.from(String(index)))).join('\n')
    const target = '../src/header.h'
    const bytes = tarFixture([
      { name: 'source/src/header.h', type: '0', value: contents },
      { name: format === 'PAX' ? 'PaxHeader' : '././@LongLink', type: format === 'PAX' ? 'x' : 'K', value: format === 'PAX' ? paxLink(target) : `${target}\0` },
      { name: 'source/include/header.h', type: '2', value: 'overridden.h' },
    ])
    const compressed = compression === 'gzip' ? gzipSync(bytes) : brotliCompressSync(bytes)
    expect(compressed.byteLength).toBeGreaterThan(64 * 1024)
    await fs.writeFile(archive, compressed)
    const destination = path.join(directory, 'unpacked')
    await unpackArchive(archive, destination, 1)
    const header = path.join(destination, 'include', 'header.h')
    expect((await fs.lstat(header)).isFile()).toBe(true)
    expect(await fs.readFile(header, 'utf8')).toBe(contents)
    expect(await fs.readFile(path.join(destination, 'src', 'header.h'), 'utf8')).toBe(contents)
  })

  it.each(['../escape', 'source/../escape', '/absolute', 'C:/absolute', String.raw`C:\absolute`, String.raw`source\escape`])('拒绝跨平台越界成员 %s', (name) => {
    expect(() => validateArchivePath(name)).toThrow('越界路径')
  })

  it('允许 POSIX 逻辑路径中的相对目录、空格与中文', () => {
    expect(() => validateArchivePath('./source/include/中文 header.h')).not.toThrow()
  })

  it('把 PrimJS 风格的相对头文件链接物化为普通文件，无需宿主软链接权限', async () => {
    const directory = await temporaryDirectory()
    const archive = path.join(directory, 'source.tar')
    await fs.writeFile(archive, tarFixture([
      { name: 'source/src/header.h', type: '0', value: '#define FIXTURE 17\n' },
      { name: 'source/include/header.h', type: '2', value: '../src/header.h' },
    ]))
    const destination = path.join(directory, 'unpacked')
    await unpackArchive(archive, destination, 1)
    const header = path.join(destination, 'include', 'header.h')
    expect((await fs.lstat(header)).isFile()).toBe(true)
    expect(await fs.readFile(header, 'utf8')).toBe('#define FIXTURE 17\n')
  })

  it.each(['../../outside', '/absolute', 'C:/absolute', String.raw`..\outside`])('拒绝越界链接 %s', async (target) => {
    const directory = await temporaryDirectory()
    const archive = path.join(directory, 'source.tar')
    await fs.writeFile(archive, tarFixture([{ name: 'source/include/header.h', type: '2', value: target }]))
    await expect(unpackArchive(archive, path.join(directory, 'unpacked'), 1)).rejects.toThrow(/路径/)
  })

  it('缓存同名文件 hash 不同即拒绝，不将旧缓存作为固定源码', async () => {
    const directory = await temporaryDirectory()
    const cache = path.join(directory, 'cache')
    await fs.mkdir(cache)
    await fs.writeFile(path.join(cache, 'source.tar.gz'), 'stale source')
    const input = { file: 'source.tar.gz', url: 'https://invalid.local/source', sha256: sha256(Buffer.from('expected source')), destination: ['source'], strip: 1 }
    await expect(downloadArchive(input, path.join(directory, 'downloads'), cache)).rejects.toThrow('SHA-256')
  })
})

describe('宿主路径进入 GN 的字符串边界', () => {
  it.each([
    ['/opt/tool chain/$sdk', String.raw`"/opt/tool chain/\$sdk"`],
    [String.raw`C:\SDK tools\$active`, String.raw`"C:\\SDK tools\\\$active"`],
    ['../SDK "quoted"', String.raw`"../SDK \"quoted\""`],
  ])('保留路径 %s 的字面身份', (input, expected) => {
    expect(gnString(input)).toBe(expected)
  })
})

it('同一链接目录拒绝再次追加归档，重试必须使用新的隔离目录', async () => {
  const directory = await temporaryDirectory()
  await fs.writeFile(path.join(directory, 'link.started'), '')
  await expect(linkPortableDecoder('unused-python', 'unused-sdk', directory, {})).rejects.toThrow(/EEXIST/)
})
