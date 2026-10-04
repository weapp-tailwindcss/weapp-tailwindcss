import assert from 'node:assert/strict'
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { execa } from 'execa'
import { satisfies } from 'semver'
import { extract } from 'tar'
import { getNativeBindingSuffix, requireNativeBinding } from '../../src/native/resolve.ts'
import { thirdPartyLicenseFile } from '../distribution.mjs'

const nativeRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packageRoot = resolve(nativeRoot, '..')
const repoRoot = resolve(packageRoot, '..', '..')
const suffix = getNativeBindingSuffix()
assert.ok(suffix, 'Package verification requires a supported native platform')
const name = `@weapp-tailwindcss/native-${suffix}`
const cssOnly = process.argv.includes('--css-only')
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

function verifyCore(binding) {
  for (const method of ['tokenizeWxml', 'analyzeJs', 'jsRuntimeSignature', 'createJsTransformer']) {
    assert.equal(typeof binding[method], 'function', `Missing core ABI: ${method}`)
  }
  assert.deepEqual([...binding.tokenizeWxml('😀 {{中}}')], [0, 2, 0, 3, 8, 1, 3, 8])
  assert.ok(binding.analyzeJs('const cls = "p-4"', 'js', 'module', false))
  assert.ok(binding.jsRuntimeSignature('const cls = "p-4"'))
  const transformer = binding.createJsTransformer(['w-[1px]'], [{ character: '[', replacement: '_b' }, { character: ']', replacement: '_B' }])
  assert.ok(transformer)
  assert.equal(transformer.transform('const x="w-[1px]"', 'js', 'module', false, {}), 'const x="w-_b1px_B"')
  assert.equal(transformer.replaceClassNames(['w-[2px]']), true)
  assert.equal(transformer.transform('const x="w-[2px]"', 'js', 'module', false, {}), 'const x="w-_b2px_B"')
}

function verifyCss(css) {
  for (const method of ['transformSelector', 'transformSelectors', 'escapeClasses', 'normalizeV4VariableFallbacks', 'normalizeUvueTransformValue', 'normalizeUvueTransformValues']) {
    assert.equal(typeof css[method], 'function', `Missing CSS ABI: ${method}`)
  }
  assert.deepEqual(css.transformSelectors(['.p-4']), [css.transformSelector('.p-4')])
  assert.ok(css.transformSelector('.p-4'))
  assert.deepEqual(css.escapeClasses(['w-[1px]']), ['w-_b1px_B'])
  assert.equal(css.normalizeV4VariableFallbacks('var(--tw-x,)'), 'var(--tw-x, )')
  assert.equal(css.normalizeUvueTransformValue('translate(var(--x,0), var(--y,0))'), 'translate(var(--x,0) var(--y,0))')
  assert.deepEqual(css.normalizeUvueTransformValues(['translate(1px,2px)', 'translate(1px,2px']), ['translate(1px 2px)', null])
}

try {
  const compilerRoot = join(tempRoot, 'node_modules', 'weapp-tailwindcss')
  const installed = join(tempRoot, 'node_modules', '@weapp-tailwindcss', `native-${suffix}`)
  const compiler = cssOnly
    ? JSON.parse(await readFile(join(packageRoot, 'package.json'), 'utf8'))
    : await packAndExtract(packageRoot, compilerRoot)
  const postcss = await packAndExtract(join(repoRoot, 'packages', 'postcss'), join(tempRoot, 'node_modules', '@weapp-tailwindcss', 'postcss'))
  const bindingManifest = await packAndExtract(join(repoRoot, 'packages-native', suffix), installed)
  if (!cssOnly) {
    assert.equal(compiler.optionalDependencies[name], bindingManifest.version)
  }
  assert.equal(bindingManifest.version, compiler.version)
  assert.equal(postcss.optionalDependencies[name], bindingManifest.version)
  assert.equal(bindingManifest.scripts, undefined)
  assert.ok(bindingManifest.files.includes(thirdPartyLicenseFile))
  assert.deepEqual(await readFile(join(installed, thirdPartyLicenseFile)), await readFile(join(repoRoot, 'packages', 'postcss', 'native', thirdPartyLicenseFile)))
  assert.ok(satisfies(process.versions.node, bindingManifest.engines.node), 'The platform package must support the current consumer Node version')
  assert.ok(!(await readdir(installed)).includes('src'))
  const require = createRequire(join(tempRoot, 'package.json'))
  if (!cssOnly) {
    verifyCore(requireNativeBinding(require, suffix))
  }
  const css = require(`${name}/postcss`)
  verifyCss(css)
  const installation = join(tempRoot, 'installed-consumer')
  await mkdir(installation)
  await writeFile(join(installation, 'package.json'), JSON.stringify({
    private: true,
    optionalDependencies: { [name]: pathToFileURL(tarballsByPackage.get(name)).href },
  }))
  await execa('pnpm', ['install', '--offline', '--ignore-scripts'], { cwd: installation })
  const installedRequire = createRequire(join(installation, 'package.json'))
  if (!cssOnly) {
    verifyCore(installedRequire(name))
  }
  verifyCss(installedRequire(`${name}/postcss`))
  console.log(`Verified packed ${name} on Node ${process.versions.node}: exact optional versions, isolated resolution, real ${cssOnly ? 'CSS' : 'JS/WXML/CSS'} ABI`)
}
finally {
  await rm(tempRoot, { recursive: true, force: true })
}
