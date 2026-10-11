import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { execa } from 'execa'
import { extract } from 'tar'
import { findWorkspaceProtocols } from '../../../scripts/verify-packed-packages.mjs'

const packageRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = path.resolve(packageRoot, '..', '..')
const tempRoot = await mkdtemp(path.join(tmpdir(), 'weapp-tailwindcss-escape-pack-'))

async function packAndExtract(source, destination) {
  const packDir = await mkdtemp(path.join(tempRoot, 'tarball-'))
  await execa('pnpm', ['pack', '--pack-destination', packDir], { cwd: source })
  const tarballs = (await readdir(packDir)).filter(file => file.endsWith('.tgz'))
  assert.equal(tarballs.length, 1)
  await mkdir(destination, { recursive: true })
  await extract({ file: path.join(packDir, tarballs[0]), cwd: destination, strip: 1 })
  const manifest = JSON.parse(await readFile(path.join(destination, 'package.json'), 'utf8'))
  assert.deepEqual(findWorkspaceProtocols(manifest), [])
  return manifest
}

async function assertNoLegacyImports(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      await assertNoLegacyImports(file)
    }
    else if (/\.(?:[cm]?js|[cm]?ts)$/.test(entry.name)) {
      assert.ok(!(await readFile(file, 'utf8')).includes('@weapp-core/escape'), `${file} 仍引用旧包名`)
    }
  }
}

try {
  await execa('pnpm', ['run', 'build'], { cwd: packageRoot, stdio: 'inherit' })
  const installed = path.join(tempRoot, 'node_modules', '@weapp-tailwindcss', 'escape')
  const manifest = await packAndExtract(packageRoot, installed)
  assert.equal(manifest.name, '@weapp-tailwindcss/escape')
  assert.deepEqual(manifest.exports, {
    '.': {
      import: { types: './dist/index.d.mts', default: './dist/index.mjs' },
      require: { types: './dist/index.d.cts', default: './dist/index.cjs' },
    },
  })
  assert.equal(manifest.main, './dist/index.cjs')
  assert.equal(manifest.module, './dist/index.mjs')
  assert.equal(manifest.types, './dist/index.d.mts')
  assert.deepEqual(manifest.dependencies, {})
  assert.equal(manifest.engines, undefined)
  assert.ok(!(await readdir(installed)).includes('src'))

  // 在 workspace 外解析包名，避免源码别名或本地链接掩盖打包缺失。
  for (const [extension, loader] of [
    ['mjs', 'import * as api from \'@weapp-tailwindcss/escape\''],
    ['cjs', 'const api = require(\'@weapp-tailwindcss/escape\')'],
  ]) {
    const file = path.join(tempRoot, `runtime.${extension}`)
    await writeFile(file, `${loader}\nconst input = 'hover:bg-red-500'; const options = { map: api.MappingChars2String };\nif (api.unescape(api.escape(input, options), options) !== input) throw new Error('转义产物不兼容');\n`)
    await execa(process.execPath, [file], { cwd: tempRoot })
  }

  for (const extension of ['mts', 'cts']) {
    await writeFile(path.join(tempRoot, `types.${extension}`), `import { escape, unescape, type EscapeOptions, type UnescapeOptions } from '@weapp-tailwindcss/escape'
const options: EscapeOptions & UnescapeOptions = { ignoreHead: true, map: { ':': '_colon_' } }
const result: string = unescape(escape('hover:flex', options), options)
void result
// @ts-expect-error 转义仅接受字符串
escape(123)
`)
  }
  await execa('pnpm', ['exec', 'tsc', '--ignoreConfig', '--noEmit', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2020', '--skipLibCheck', path.join(tempRoot, 'types.mts'), path.join(tempRoot, 'types.cts')], { cwd: repoRoot })

  const consumers = [
    ['packages/postcss', 'dependencies'],
    ['packages/weapp-tailwindcss', 'dependencies'],
    ['packages-runtime/runtime', 'dependencies'],
    ['packages-runtime/merge', 'dependencies'],
    ['packages-runtime/cn', 'devDependencies'],
  ]
  for (const [directory, section] of consumers) {
    const extracted = await mkdtemp(path.join(tempRoot, 'consumer-'))
    const packed = await packAndExtract(path.resolve(repoRoot, directory), extracted)
    assert.equal(packed[section]['@weapp-tailwindcss/escape'], manifest.version)
    assert.equal(packed[section]['@weapp-core/escape'], undefined)
    await assertNoLegacyImports(path.join(extracted, 'dist'))
  }
  console.log('已验证 escape tarball、ESM/CJS、双端类型和五个消费者的发布依赖范围')
}
finally {
  await rm(tempRoot, { recursive: true, force: true })
}
