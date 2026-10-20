import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { execa } from 'execa'
import { sha256 } from './archives'
import { gnString } from './gn'
import { linkPortableDecoder } from './link'
import { packagePortableDecoder } from './package'
import { prepareSources } from './prepare'
import { verifyToolchain } from './toolchain'
import { verifyPortableDecoder } from './verify'

const decoderRoot = fileURLToPath(new URL('..', import.meta.url))

async function main() {
  const { values } = parseArgs({ options: {
    'emsdk': { type: 'string' },
    'python': { type: 'string', default: process.platform === 'win32' ? 'python' : 'python3' },
    'sdk-python': { type: 'string' },
    'archive-cache': { type: 'string' },
    'patch-root': { type: 'string' },
    'jobs': { type: 'string', default: '6' },
    'publish': { type: 'boolean', default: false },
  } })
  if (!values.emsdk) {
    throw new Error('需要 --emsdk 指向固定 4.0.22 SDK；首次安装见 README')
  }
  const jobs = Number(values.jobs)
  if (!Number.isSafeInteger(jobs) || jobs < 1 || jobs > 64) {
    throw new Error('--jobs 必须是 1 至 64 的整数')
  }
  const emsdk = path.resolve(values.emsdk)
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx-decoder-rebuild-'))
  const report = path.join(directory, 'build-evidence.json')
  try {
    const { source, inputs } = await prepareSources(directory, decoderRoot, values['archive-cache'] ? path.resolve(values['archive-cache']) : undefined, values['patch-root'] ? path.resolve(values['patch-root']) : undefined)
    const python = values['sdk-python'] ? path.resolve(values['sdk-python']) : (values.python ?? 'python3')
    const environment = { ...process.env, SOURCE_DATE_EPOCH: '0', EMSDK_PYTHON: python, EM_CONFIG: path.join(emsdk, '.emscripten'), PYTHONPATH: path.join(directory, 'pyyaml', 'lib'), PATH: [path.join(directory, 'typescript', 'bin'), process.env.PATH].join(path.delimiter) }
    const toolchain = await verifyToolchain(emsdk, python, inputs, environment)
    const run = (command: string, args: string[]) => execa(command, args, { cwd: source, env: environment, stdio: 'inherit' })
    await run(python, [path.join(source, 'tools', 'error_code', 'gen_error_code.py'), '-l', 'cpp'])
    const output = path.join(source, 'out', 'Wasm')
    await fs.mkdir(output, { recursive: true })
    // GN 字符串是构建系统的逻辑值；同时保留空格、反斜杠并阻止 $ 插值。
    const args = [
      'disallow_undefined_symbol = false',
      'enable_security_protection = false',
      'use_flutter_cxx = false',
      'is_debug = false',
      'oliver_type = "tasm"',
      'build_lepus_compile = true',
      'enable_inspector = true',
      'enable_inspector_test = true',
      'build_lynx_lepus_node = true',
      'node_headers_dst_dir = "//oliver/lynx-tasm"',
      'target_cpu = "wasm"',
      'enable_lto = false',
      `emsdk_dir = ${gnString(emsdk)}`,
    ].join('\n')
    await fs.writeFile(path.join(output, 'args.gn'), `${args}\n`)
    const gn = path.join(source, 'buildtools', 'gn', process.platform === 'win32' ? 'gn.exe' : 'gn')
    await run(gn, ['gen', output])
    // 仅构建完整归档；链接使用新目录，避免上游 action 重跑时向归档重复追加目标文件。
    await run('ninja', ['-C', output, 'obj/oliver/lynx-tasm/liblepus.a', '-j', String(jobs)])
    const link = path.join(directory, 'link')
    await fs.mkdir(link)
    await fs.copyFile(path.join(output, 'obj', 'oliver', 'lynx-tasm', 'liblepus.a'), path.join(link, 'liblepus.a'))
    const artifact = await linkPortableDecoder(python, emsdk, link, environment)
    const semanticProbe = await verifyPortableDecoder(artifact, values['patch-root'] ? path.resolve(values['patch-root']) : decoderRoot)
    const raw = await fs.readFile(artifact)
    const compressed = gzipSync(raw, { level: 9 })
    const expected = JSON.parse(await fs.readFile(path.join(decoderRoot, 'manifest.json'), 'utf8'))
    const evidence = {
      schemaVersion: 1,
      sourceCommit: inputs.sourceCommit,
      compilerCommit: inputs.compilerCommit,
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      sourceDateEpoch: '0',
      coreInputsSha256: sha256(await fs.readFile(path.join(decoderRoot, 'rebuild', 'inputs.json'))),
      bootstrapInputsSha256: sha256(await fs.readFile(path.join(decoderRoot, 'rebuild', 'bootstrap-inputs.json'))),
      semanticProbe,
      toolchain,
      raw: { byteLength: raw.length, sha256: sha256(raw) },
      gzip: { byteLength: compressed.length, sha256: sha256(compressed) },
      matchesCommittedRaw: sha256(raw) === expected.decompressed.sha256,
      matchesCommittedGzip: sha256(compressed) === expected.compressed.sha256,
    }
    await fs.writeFile(report, `${JSON.stringify(evidence, null, 2)}\n`)
    if (values.publish) {
      await packagePortableDecoder({ source, emsdk, input: artifact, patchRoot: values['patch-root'] })
    }
    process.stdout.write(`${JSON.stringify({ directory, report, ...evidence })}\n`)
  }
  catch (error) {
    process.stderr.write(`构建失败，隔离工作目录保留在 ${directory}\n`)
    throw error
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
