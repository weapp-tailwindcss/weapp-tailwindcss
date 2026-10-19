import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { gunzipSync } from 'node:zlib'

interface Digest {
  byteLength: number
  sha256: string
}

interface DecoderManifest {
  schemaVersion: number
  version: string
  sourceCommit: string
  patches: Array<{ file: string, sha256: string }>
  compressed: Digest & { file: string }
  decompressed: Digest
}

interface DecodeResult {
  status: number
  result: string
}

interface DecoderModule {
  HEAPU8: Uint8Array
  _malloc: (size: number) => number
  _free: (pointer: number) => void
  _decode: (pointer: number, size: number) => DecodeResult
}

type DecoderFactory = () => Promise<DecoderModule>

export interface DecodedLynxBundle {
  'engine-version': string
  'page-config': string
  'css': { text: string }
}

const decoderDirectory = import.meta.dirname
let factoryPromise: Promise<DecoderFactory> | undefined

function sha256(value: Uint8Array | string) {
  return createHash('sha256').update(value).digest('hex')
}

function readManifest(directory: string) {
  const source = readFileSync(path.join(directory, 'manifest.json'), 'utf8')
  const manifest = JSON.parse(source) as DecoderManifest
  if (manifest.schemaVersion !== 1 || manifest.version !== '0.0.53'
    || !/^[a-f0-9]{40}$/.test(manifest.sourceCommit)
    || manifest.compressed.file !== 'vendor/lepus.cjs.gz'
    || !manifest.patches.length
    || manifest.patches.some(patch => !/^patches\/[a-z0-9-]+\.patch$/.test(patch.file))) {
    throw new Error('Lynx decoder manifest 的固定来源或资源身份无效')
  }
  return { source, manifest }
}

/** 身份覆盖构建来源、补丁、工具链和产物；修改其中任一项都会使历史报告过期。 */
export function lynxDecoderIdentity() {
  const { source, manifest } = readManifest(decoderDirectory)
  return `${manifest.version}+${sha256(source)}`
}

function assertDigest(source: Uint8Array, expected: Digest, name: string) {
  if (!Number.isSafeInteger(expected.byteLength) || expected.byteLength <= 0 || expected.byteLength > 32 * 1024 * 1024
    || source.byteLength !== expected.byteLength || sha256(source) !== expected.sha256) {
    throw new Error(`Lynx decoder ${name} 的字节或 SHA-256 不匹配`)
  }
}

/** 仅加载固定来源的便携 WASM；缺失、篡改或解码失败均不得回退 serializer 或系统原生库。 */
export async function loadVerifiedDecoderFactory(directory = decoderDirectory): Promise<DecoderFactory> {
  const { manifest } = readManifest(directory)
  for (const patch of manifest.patches) {
    // manifest 中的 file 是受限的仓库资源名，进入文件系统时统一由 path.resolve 处理。
    if (sha256(await fs.readFile(path.resolve(directory, patch.file))) !== patch.sha256) {
      throw new Error(`Lynx decoder 补丁 ${patch.file} 的 SHA-256 不匹配`)
    }
  }
  const compressed = await fs.readFile(path.resolve(directory, manifest.compressed.file))
  assertDigest(compressed, manifest.compressed, 'gzip')
  if (!Number.isSafeInteger(manifest.decompressed.byteLength) || manifest.decompressed.byteLength <= 0 || manifest.decompressed.byteLength > 32 * 1024 * 1024) {
    throw new Error('Lynx decoder WASM 的固定大小无效')
  }
  const decompressed = gunzipSync(compressed, { maxOutputLength: manifest.decompressed.byteLength })
  assertDigest(decompressed, manifest.decompressed, 'WASM')
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-decoder-'))
  const modulePath = path.join(temporaryDirectory, 'lepus.cjs')
  const require = createRequire(import.meta.url)
  try {
    await fs.writeFile(modulePath, decompressed)
    const factory: unknown = require(modulePath)
    if (typeof factory !== 'function') {
      throw new TypeError('Lynx decoder 未提供 WASM factory')
    }
    return factory as DecoderFactory
  }
  finally {
    delete require.cache[modulePath]
    await fs.rm(temporaryDirectory, { recursive: true, force: true })
  }
}

/** 每次解码使用独立实例，输入只接受实际 bundle 字节，保留 decoder 的原始 CSS 展示文本。 */
export async function decodeLynxBundle(source: Uint8Array): Promise<DecodedLynxBundle> {
  if (source.byteLength === 0 || source.byteLength > 64 * 1024 * 1024) {
    throw new Error('Lynx bundle 字节长度无效')
  }
  factoryPromise ??= loadVerifiedDecoderFactory()
  const factory = await factoryPromise
  const module = await factory()
  const pointer = module._malloc(source.byteLength)
  if (!pointer) {
    throw new Error('Lynx decoder 无法分配 bundle 内存')
  }
  try {
    module.HEAPU8.set(source, pointer)
    // 上游以 embind value_object 复制 status/result，只有输入缓冲区需要手动释放。
    const result = module._decode(pointer, source.byteLength)
    if (result.status !== 0) {
      throw new Error(`Lynx bundle 解码失败：${result.result}`)
    }
    const decoded = JSON.parse(result.result) as DecodedLynxBundle
    if (typeof decoded.css?.text !== 'string' || typeof decoded['engine-version'] !== 'string' || typeof decoded['page-config'] !== 'string') {
      throw new TypeError('Lynx bundle 解码结果缺少 CSS 或版本配置')
    }
    return decoded
  }
  finally {
    module._free(pointer)
  }
}
