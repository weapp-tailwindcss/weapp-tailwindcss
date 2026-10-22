import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { decoderDataDirectory } from '../paths'
import { sha256 } from './archives'

const decoderRoot = decoderDataDirectory
const licenseSources = [
  ['source', 'LICENSE'],
  ['source', 'NOTICE'],
  ['source', 'third_party', 'quickjs', 'src', 'LICENSE'],
  ['source', 'third_party', 'quickjs', 'LICENSE'],
  ['source', 'third_party', 'jsoncpp', 'LICENSE'],
  ['source', 'third_party', 'double-conversion', 'LICENSE'],
  ['source', 'third_party', 'rapidjson', 'license.txt'],
  ['source', 'third_party', 'modp_b64', 'LICENSE'],
  ['source', 'third_party', 'aes', 'LICENSE'],
  ['emsdk', 'upstream', 'emscripten', 'LICENSE'],
  ['emsdk', 'upstream', 'emscripten', 'system', 'lib', 'libc', 'musl', 'COPYRIGHT'],
  ['emsdk', 'upstream', 'emscripten', 'system', 'lib', 'libcxx', 'LICENSE.TXT'],
  ['emsdk', 'upstream', 'emscripten', 'system', 'lib', 'libcxxabi', 'LICENSE.TXT'],
  ['emsdk', 'upstream', 'emscripten', 'system', 'lib', 'compiler-rt', 'LICENSE.TXT'],
  ['emsdk', 'upstream', 'emscripten', 'system', 'lib', 'libunwind', 'LICENSE.TXT'],
]

/** 只从实际构建产物生成 vendor、许可与固定身份，不修改解码器源码。 */
export async function packagePortableDecoder(options: { source: string, emsdk: string, input: string, patchRoot?: string }) {
  const inputs = JSON.parse(await fs.readFile(path.join(decoderRoot, 'rebuild', 'inputs.json'), 'utf8'))
  for (const patch of inputs.patches) {
    const bytes = await fs.readFile(path.resolve(options.patchRoot ?? decoderRoot, patch.file))
    if (sha256(bytes) !== patch.sha256) {
      throw new Error(`补丁 SHA-256 不匹配: ${patch.file}`)
    }
  }
  const raw = await fs.readFile(options.input)
  if (!raw.includes(Buffer.from('WebAssembly')) || !raw.includes(Buffer.from('_decode'))) {
    throw new Error('产物缺少 WASM 或 decode 接口')
  }
  const compressed = gzipSync(raw, { level: 9 })
  const vendor = path.join(decoderRoot, 'vendor')
  await fs.mkdir(path.join(vendor, 'licenses'), { recursive: true })
  const licenses = []
  for (const [root, ...segments] of licenseSources) {
    const bytes = await fs.readFile(path.join(root === 'source' ? options.source : options.emsdk, ...segments))
    const file = `${root}-${segments.join('-')}.txt`
    await fs.writeFile(path.join(vendor, 'licenses', file), bytes)
    licenses.push({ source: [root, ...segments].join('/'), file: `vendor/licenses/${file}`, byteLength: bytes.length, sha256: sha256(bytes) })
  }
  await fs.writeFile(path.join(vendor, 'lepus.cjs.gz'), compressed)
  const manifest = {
    schemaVersion: 1,
    version: '0.0.53',
    sourceCommit: inputs.sourceCommit,
    buildrootCommit: inputs.buildrootCommit,
    primjsCommit: inputs.primjsCommit,
    toolsSharedCommit: inputs.toolsSharedCommit,
    emsdkCommit: inputs.emsdkCommit,
    emscriptenVersion: inputs.emscriptenVersion,
    compilerCommit: inputs.compilerCommit,
    typescriptVersion: inputs.typescriptVersion,
    inputs: { file: 'rebuild/inputs.json', sha256: sha256(await fs.readFile(path.join(decoderRoot, 'rebuild', 'inputs.json'))) },
    patches: inputs.patches,
    compressed: { file: 'vendor/lepus.cjs.gz', byteLength: compressed.length, sha256: sha256(compressed) },
    decompressed: { byteLength: raw.length, sha256: sha256(raw) },
    license: { upstream: 'Apache-2.0', files: licenses },
  }
  await fs.writeFile(path.join(decoderRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return manifest
}

async function main() {
  const { values } = parseArgs({ options: { 'source': { type: 'string' }, 'emsdk': { type: 'string' }, 'input': { type: 'string' }, 'patch-root': { type: 'string' } } })
  if (!values.source || !values.emsdk || !values.input) {
    throw new Error('需要 --source、--emsdk 和 --input')
  }
  const manifest = await packagePortableDecoder({ source: path.resolve(values.source), emsdk: path.resolve(values.emsdk), input: path.resolve(values.input), patchRoot: values['patch-root'] ? path.resolve(values['patch-root']) : undefined })
  process.stdout.write(`${JSON.stringify({ compressed: manifest.compressed, decompressed: manifest.decompressed })}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
}
