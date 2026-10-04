import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { extract } from 'tar'
import { getNativeBindingSuffix, requireNativeBinding } from '../../src/native/resolve.ts'

const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = resolve(nativeRoot, '..')
const repoRoot = resolve(packageRoot, '..', '..')
const suffix = getNativeBindingSuffix()
assert.ok(suffix, 'Package verification requires a supported native platform')
const name = `@weapp-tailwindcss/native-${suffix}`
const tempRoot = await mkdtemp(join(tmpdir(), 'weapp-tw-native-package-'))
const tarballsByPackage = new Map()

async function packAndExtract(source, destination) {
  const tarballRoot = await mkdtemp(join(tempRoot, 'tarball-'))
  await execa('pnpm', ['pack', '--pack-destination', tarballRoot], { cwd: source })
  const tarballs = (await readdir(tarballRoot)).filter(file => file.endsWith('.tgz'))
  assert.equal(tarballs.length, 1)
  await mkdir(destination, { recursive: true })
  await extract({ cwd: destination, file: join(tarballRoot, tarballs[0]), strip: 1 })
  const manifest = JSON.parse(await readFile(join(destination, 'package.json'), 'utf8'))
  tarballsByPackage.set(manifest.name, join(tarballRoot, tarballs[0]))
  return manifest
}

try {
  const compilerRoot = join(tempRoot, 'node_modules', 'weapp-tailwindcss')
  const installed = join(tempRoot, 'node_modules', '@weapp-tailwindcss', `native-${suffix}`)
  const compiler = await packAndExtract(packageRoot, compilerRoot)
  const postcss = await packAndExtract(join(repoRoot, 'packages', 'postcss'), join(tempRoot, 'node_modules', '@weapp-tailwindcss', 'postcss'))
  const bindingManifest = await packAndExtract(join(repoRoot, 'packages-native', suffix), installed)
  assert.equal(compiler.optionalDependencies[name], bindingManifest.version)
  assert.equal(bindingManifest.version, compiler.version)
  assert.equal(postcss.optionalDependencies[name], bindingManifest.version)
  assert.equal(bindingManifest.scripts, undefined)
  assert.ok(!(await readdir(installed)).includes('src'))
  const require = createRequire(join(compilerRoot, 'package.json'))
  const binding = requireNativeBinding(require, suffix)
  assert.equal(typeof binding.tokenizeWxml, 'function')
  assert.equal(typeof binding.analyzeJs, 'function')
  assert.equal(typeof binding.jsRuntimeSignature, 'function')
  assert.deepEqual([...binding.tokenizeWxml('😀 {{中}}')], [0, 2, 0, 3, 8, 1, 3, 8])
  assert.ok(binding.analyzeJs('const cls = "p-4"', 'js', 'module', false))
  assert.ok(binding.jsRuntimeSignature('const cls = "p-4"'))
  const css = require(`${name}/postcss`)
  assert.equal(typeof css.transformSelector, 'function')
  assert.equal(typeof css.transformSelectors, 'function')
  assert.equal(typeof css.escapeClasses, 'function')
  assert.deepEqual(css.transformSelectors(['.p-4']), [css.transformSelector('.p-4')])
  assert.ok(css.transformSelector('.p-4'))
  const installation = join(tempRoot, 'installed-consumer')
  await mkdir(installation)
  await writeFile(join(installation, 'package.json'), JSON.stringify({
    private: true,
    optionalDependencies: { [name]: pathToFileURL(tarballsByPackage.get(name)).href },
  }))
  await execa('pnpm', ['install', '--offline', '--ignore-scripts'], { cwd: installation })
  const installedRequire = createRequire(join(installation, 'package.json'))
  assert.deepEqual([...installedRequire(name).tokenizeWxml('x')], [0, 1, 0])
  assert.equal(installedRequire(`${name}/postcss`).transformSelector('.p-4'), css.transformSelector('.p-4'))
  console.log(`Verified packed ${name}: exact optional versions, isolated resolution, real JS/WXML/CSS ABI`)
}
finally {
  await rm(tempRoot, { recursive: true, force: true })
}
