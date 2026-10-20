import { Buffer } from 'node:buffer'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import identifierFixture from '../packages/lynx/src/decoder-data/fixtures/selector-identifiers.json'
import { decodeLynxBundle, loadVerifiedDecoderFactory, lynxDecoderIdentity } from './lynx/decoder'
import { decoderDataDirectory } from './lynx/decoder/paths'

const directories: string[] = []
const globalKeys: string[] = []
const sourceDirectory = decoderDataDirectory
const globals = globalThis as Record<string, unknown>
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')

afterEach(async () => {
  for (const key of globalKeys.splice(0)) {
    delete globals[key]
  }
  await Promise.all(directories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })))
})

async function temporaryDirectory() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx decoder cache '))
  directories.push(directory)
  return directory
}

async function realDecoder() {
  const directory = await temporaryDirectory()
  const manifest = JSON.parse(await fs.readFile(path.join(sourceDirectory, 'manifest.json'), 'utf8'))
  const files: string[] = ['manifest.json', manifest.compressed.file, manifest.inputs.file, ...manifest.patches.map((patch: { file: string }) => patch.file)]
  for (const file of files) {
    const destination = path.resolve(directory, file)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.copyFile(path.resolve(sourceDirectory, file), destination)
  }
  return { directory, manifest }
}

async function controlledDecoder(failFirstLoad = false) {
  const directory = await temporaryDirectory()
  const key = `lynxDecoderCache${randomUUID()}`
  const instanceKey = `${key}Instances`
  globalKeys.push(key, instanceKey)
  const marker = JSON.stringify(key)
  const instanceMarker = JSON.stringify(instanceKey)
  const source = (value: string) => Buffer.from(`
const generation = globalThis[${marker}] = (globalThis[${marker}] || 0) + 1;
${failFirstLoad ? 'if (generation === 1) throw new Error("首次加载故障");' : ''}
module.exports = async () => {
  globalThis[${instanceMarker}] = (globalThis[${instanceMarker}] || 0) + 1;
  return {
  HEAPU8: new Uint8Array(4096),
  _malloc: () => 1,
  _free: () => {},
  _decode: () => ({ status: 0, result: JSON.stringify({
    'engine-version': '4.0', 'page-config': '{}', css: { text: ${JSON.stringify(value)} }
  }) })
  };
};
`)
  const patch = Buffer.from('固定测试补丁\n')
  const inputs = Buffer.from('{"source":"固定测试来源"}\n')
  const raw = source('.version-a{width:16px}')
  const compressed = gzipSync(raw)
  const manifest = {
    schemaVersion: 1,
    version: '0.0.53',
    sourceCommit: '1'.repeat(40),
    inputs: { file: 'rebuild/inputs.json', sha256: sha256(inputs) },
    patches: [{ file: 'patches/0001-test.patch', sha256: sha256(patch) }],
    compressed: { file: 'vendor/lepus.cjs.gz', byteLength: compressed.length, sha256: sha256(compressed) },
    decompressed: { byteLength: raw.length, sha256: sha256(raw) },
  }
  const saveManifest = () => fs.writeFile(path.join(directory, 'manifest.json'), `${JSON.stringify(manifest)}\n`)
  for (const [file, bytes] of [[manifest.inputs.file, inputs], [manifest.patches[0]!.file, patch], [manifest.compressed.file, compressed]] as const) {
    const destination = path.resolve(directory, file)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, bytes)
  }
  await saveManifest()
  return {
    directory,
    manifest,
    key,
    instanceKey,
    saveManifest,
    async replace(value: string) {
      const raw = source(value)
      const compressed = gzipSync(raw)
      manifest.decompressed = { byteLength: raw.length, sha256: sha256(raw) }
      manifest.compressed = { ...manifest.compressed, byteLength: compressed.length, sha256: sha256(compressed) }
      await fs.writeFile(path.resolve(directory, manifest.compressed.file), compressed)
      await saveManifest()
    },
  }
}

describe('decoder 的本轮身份与缓存边界', () => {
  it('真实 bundle 首次解码后仍拒绝被篡改的 gzip，恢复原字节后可继续', async () => {
    const { directory, manifest } = await realDecoder()
    const bundle = Buffer.from(identifierFixture.bundle.base64, 'base64')
    const first = await decodeLynxBundle(bundle, directory)
    const file = path.resolve(directory, manifest.compressed.file)
    const original = await fs.readFile(file)
    const tampered = Buffer.from(original)
    tampered[tampered.length - 1] = tampered[tampered.length - 1]! ^ 1
    await fs.writeFile(file, tampered)
    await expect(decodeLynxBundle(bundle, directory)).rejects.toThrow(/gzip.*SHA-256/)
    await fs.writeFile(file, original)
    await expect(decodeLynxBundle(bundle, directory)).resolves.toEqual(first)
  })

  it.each(['inputs', 'patch'] as const)('缓存命中后仍核 %s 的当前字节，恢复后复用已验证 factory', async (mode) => {
    const fixture = await controlledDecoder()
    const bundle = new Uint8Array([1])
    const first = await decodeLynxBundle(bundle, fixture.directory)
    const file = path.resolve(fixture.directory, mode === 'inputs' ? fixture.manifest.inputs.file : fixture.manifest.patches[0]!.file)
    const original = await fs.readFile(file)
    await fs.writeFile(file, Buffer.concat([original, Buffer.from('篡改')]))
    await expect(decodeLynxBundle(bundle, fixture.directory)).rejects.toThrow(/SHA-256/)
    await fs.writeFile(file, original)
    await expect(decodeLynxBundle(bundle, fixture.directory)).resolves.toEqual(first)
    expect(globals[fixture.key]).toBe(1)
  })

  it('manifest 更新后使用对应新产物，身份变化不能配旧 factory', async () => {
    const fixture = await controlledDecoder()
    const bundle = new Uint8Array([1])
    const identity = lynxDecoderIdentity(fixture.directory)
    expect((await decodeLynxBundle(bundle, fixture.directory)).css.text).toBe('.version-a{width:16px}')
    await fixture.replace('.version-b{width:32px}')
    expect(lynxDecoderIdentity(fixture.directory)).not.toBe(identity)
    expect((await decodeLynxBundle(bundle, fixture.directory)).css.text).toBe('.version-b{width:32px}')
    expect(globals[fixture.key]).toBe(2)
  })

  it('只有 inputs 身份更新也重建 factory，同一新身份随后复用', async () => {
    const fixture = await controlledDecoder()
    const bundle = new Uint8Array([1])
    await decodeLynxBundle(bundle, fixture.directory)
    const inputs = Buffer.from('{"source":"新的固定来源"}\n')
    fixture.manifest.inputs.sha256 = sha256(inputs)
    await fs.writeFile(path.resolve(fixture.directory, fixture.manifest.inputs.file), inputs)
    await fixture.saveManifest()
    await decodeLynxBundle(bundle, fixture.directory)
    await decodeLynxBundle(bundle, fixture.directory)
    expect(globals[fixture.key]).toBe(2)
  })

  it('首次加载失败不会留下永久 rejection，相同 manifest 可在故障恢复后重新加载', async () => {
    const fixture = await controlledDecoder(true)
    const bundle = new Uint8Array([1])
    await expect(decodeLynxBundle(bundle, fixture.directory)).rejects.toThrow('首次加载故障')
    await expect(decodeLynxBundle(bundle, fixture.directory)).resolves.toMatchObject({ css: { text: '.version-a{width:16px}' } })
    expect(globals[fixture.key]).toBe(2)
  })

  it('并行解码共享同一已验证身份的加载，实例仍分别创建', async () => {
    const fixture = await controlledDecoder()
    const bundle = new Uint8Array([1])
    const results = await Promise.all(Array.from({ length: 8 }, () => decodeLynxBundle(bundle, fixture.directory)))
    expect(results.every(result => result.css.text === '.version-a{width:16px}')).toBe(true)
    expect(globals[fixture.key]).toBe(1)
    expect(globals[fixture.instanceKey]).toBe(8)
  })

  it('旧身份的延迟加载失败不能清掉新身份已成功建立的缓存', async () => {
    const old = await controlledDecoder(true)
    const current = await controlledDecoder()
    const bundle = new Uint8Array([1])
    const entered = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const originalWriteFile = fs.writeFile
    const spy = vi.spyOn(fs, 'writeFile').mockImplementation(async (...args: Parameters<typeof fs.writeFile>) => {
      if (typeof args[0] === 'string' && path.basename(args[0]) === 'lepus.cjs'
        && Buffer.isBuffer(args[1]) && args[1].includes(Buffer.from(old.key))) {
        entered.resolve()
        await release.promise
      }
      return originalWriteFile(...args)
    })
    const oldResult = decodeLynxBundle(bundle, old.directory).then(
      () => ({ error: undefined }),
      (error: unknown) => ({ error }),
    )
    try {
      await Promise.race([
        entered.promise,
        oldResult.then(() => { throw new Error('旧身份未进入受控加载阶段') }),
      ])
      await decodeLynxBundle(bundle, current.directory)
      release.resolve()
      expect((await oldResult).error).toMatchObject({ message: '首次加载故障' })
      await decodeLynxBundle(bundle, current.directory)
      expect(globals[old.key]).toBe(1)
      expect(globals[current.key]).toBe(1)
      expect(globals[current.instanceKey]).toBe(2)
    }
    finally {
      release.resolve()
      await oldResult
      spy.mockRestore()
    }
  })

  it.each(['../inputs.json', 'C:\\inputs.json', 'rebuild/../inputs.json'])('构建输入拒绝资源名 %s，不能映射到任意文件系统路径', async (file) => {
    const fixture = await controlledDecoder()
    fixture.manifest.inputs.file = file
    await fixture.saveManifest()
    await expect(loadVerifiedDecoderFactory(fixture.directory)).rejects.toThrow(/固定来源或资源身份/)
  })
})
