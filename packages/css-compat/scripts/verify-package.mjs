import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { extract } from 'tar'
import { install, pack, packageRoot, repositoryRoot } from './package-utils.mjs'
import { assertPackedPackageVersion, assertPackedWorkspaceDependency } from './package-versions.mjs'

const tempRoot = await mkdtemp(path.join(tmpdir(), 'css-compat-tarball-'))
try {
  const sourceManifest = JSON.parse(await readFile(path.join(packageRoot, 'package.json'), 'utf8'))
  const tarball = await pack(tempRoot)
  const packaged = path.join(tempRoot, 'css-compat-extracted')
  await mkdir(packaged)
  await extract({ cwd: packaged, file: tarball })
  for (const [file, link] of [['README.md', './README.zh-CN.md'], ['README.zh-CN.md', './README.md']]) {
    const content = await readFile(path.join(packaged, 'package', file), 'utf8')
    assert.ok(content.startsWith('# @weapp-tailwindcss/css-compat'))
    assert.ok(content.includes(link), `${file} 缺少语言切换`)
  }
  assertPackedPackageVersion(JSON.parse(await readFile(path.join(packaged, 'package', 'package.json'), 'utf8')), sourceManifest)
  const consumer = path.join(tempRoot, 'consumer')
  await install(consumer, { postcss: '8.5.29' }, { '@weapp-tailwindcss/css-compat': tarball })
  const require = createRequire(path.join(consumer, 'package.json'))
  const postcss = require('postcss')
  const keys = ['@weapp-tailwindcss/css-compat', '@weapp-tailwindcss/css-compat/layers', '@weapp-tailwindcss/css-compat/diagnostics', '@weapp-tailwindcss/css-compat/legacy']
  // 从隔离消费者执行裸包 import，真实验证 exports 的 import 条件。
  const esmCheck = path.join(consumer, 'verify-esm.mjs')
  await writeFile(esmCheck, `import assert from 'node:assert/strict'
import postcss from 'postcss'
const keys = ${JSON.stringify(keys)}
const exports = {}
for (const specifier of keys) {
  const api = await import(specifier)
  exports[specifier] = Object.keys(api).sort()
  if (api.compileCascadeLayers) {
    const root = postcss.parse('@layer a,b;@layer a{.x{color:red!important}}@layer b{.x{color:blue!important}}')
    api.compileCascadeLayers(root, { mode: 'ordered', onConflict: 'error' })
    assert.ok(root.toString().indexOf('blue') < root.toString().indexOf('red'))
  }
}
console.log(JSON.stringify(exports))
`)
  const esmExports = JSON.parse((await execa('node', [esmCheck], { cwd: consumer })).stdout)
  for (const specifier of keys) {
    const cjs = require(specifier)
    assert.deepEqual(Object.keys(cjs).sort(), esmExports[specifier])
    if (cjs.compileCascadeLayers) {
      const css = '@layer a,b;@layer a{.x{color:red!important}}@layer b{.x{color:blue!important}}'
      const output = cjs.compileCascadeLayers(postcss.parse(css), { mode: 'ordered', onConflict: 'error' }).root.toString()
      assert.ok(output.indexOf('blue') < output.indexOf('red'))
    }
  }
  const tree = JSON.parse((await execa('pnpm', ['list', '--depth', 'Infinity', '--json'], { cwd: consumer })).stdout)
  const forbidden = /^(?:@tailwindcss\/|tailwindcss$|@pandacss\/|@babel\/|@weapp-tailwindcss\/(?:engine|source-scan|native)|lightningcss$|mdn-data$)/
  function inspect(value) {
    if (!value || typeof value !== 'object') {
      return
    }
    for (const [key, child] of Object.entries(value)) {
      assert.ok(!forbidden.test(key), `意外安装依赖 ${key}`)
      inspect(child)
    }
  }
  inspect(tree)
  for (const extension of ['mts', 'cts']) {
    await writeFile(path.join(consumer, `types.${extension}`), `import postcss from 'postcss'
import { compileCascadeLayers, type CascadeLayerOptions, type CascadeLayerDiagnostic } from '@weapp-tailwindcss/css-compat'
import { createCascadeLayersPlugin } from '@weapp-tailwindcss/css-compat/layers'
import { CascadeLayerError } from '@weapp-tailwindcss/css-compat/diagnostics'
import { consumeCascadeLayers } from '@weapp-tailwindcss/css-compat/legacy'
const options: CascadeLayerOptions = { mode: 'ordered', onConflict: 'error' }
const root = postcss.parse('@layer a{.x{color:red}}')
const diagnostics: CascadeLayerDiagnostic[] = compileCascadeLayers(root, options).diagnostics
postcss([createCascadeLayersPlugin(options)])
consumeCascadeLayers(root)
void diagnostics; void CascadeLayerError
// @ts-expect-error 必须指定 mode
compileCascadeLayers(root, {})
`)
  }
  await execa('pnpm', ['exec', 'tsc', '--ignoreConfig', '--noEmit', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', '--skipLibCheck', 'false', path.join(consumer, 'types.mts'), path.join(consumer, 'types.cts')], { cwd: repositoryRoot })
  const postcssRoot = path.join(repositoryRoot, 'packages', 'postcss')
  const postcssSourceManifest = JSON.parse(await readFile(path.join(postcssRoot, 'package.json'), 'utf8'))
  const postcssTarball = await pack(tempRoot, postcssRoot)
  const extracted = path.join(tempRoot, 'postcss-extracted')
  await mkdir(extracted)
  await extract({ cwd: extracted, file: postcssTarball })
  const manifest = JSON.parse(await readFile(path.join(extracted, 'package', 'package.json'), 'utf8'))
  assertPackedPackageVersion(manifest, postcssSourceManifest)
  assertPackedWorkspaceDependency(manifest, postcssSourceManifest, sourceManifest)
  console.log(JSON.stringify({ tarballBytes: (await stat(tarball)).size, entrypoints: keys.length, esm: true, cjs: true, types: ['mts', 'cts'], isolatedTree: '无 generator/scanner/native/MDN', postcssDependency: manifest.dependencies['@weapp-tailwindcss/css-compat'] }))
}
finally {
  await rm(tempRoot, { recursive: true, force: true })
  console.log('已清理本任务 tarball 与隔离安装目录')
}
