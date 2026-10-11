import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { x as extract } from 'tar'
import { createPnpmCommand } from '../../../scripts/pnpm-command.mjs'
import { findWorkspaceProtocols } from '../../../scripts/verify-packed-packages.mjs'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(packageRoot, '../..')
const require = createRequire(path.join(repoRoot, 'package.json'))

function run(command, args, cwd, shell = false) {
  const result = spawnSync(command, args, { cwd, shell, encoding: 'utf8', env: { ...process.env, CI: '1' }, maxBuffer: 20 * 1024 * 1024 })
  if (result.error) {
    throw result.error
  }
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
}

async function packAndExtract(sourceRoot, temporaryRoot, consumerRoot, name) {
  const destination = path.join(temporaryRoot, name)
  await mkdir(destination)
  const command = createPnpmCommand(['pack', '--pack-destination', destination])
  run(command.command, command.args, sourceRoot, command.shell)
  const tarballs = (await readdir(destination)).filter(file => file.endsWith('.tgz'))
  assert.equal(tarballs.length, 1)
  const unpacked = path.join(destination, 'unpacked')
  await mkdir(unpacked)
  await extract({ file: path.join(destination, tarballs[0]), cwd: unpacked })
  const files = path.join(unpacked, 'package')
  const manifest = JSON.parse(await readFile(path.join(files, 'package.json'), 'utf8'))
  assert.deepEqual(findWorkspaceProtocols(manifest), [])
  const installed = path.join(consumerRoot, 'node_modules', manifest.name)
  await mkdir(path.dirname(installed), { recursive: true })
  await rename(files, installed)
  return { manifest, installed }
}

const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'weapp env package '))
try {
  const consumerRoot = path.join(temporaryRoot, 'consumer')
  await mkdir(consumerRoot)
  await writeFile(path.join(consumerRoot, 'package.json'), JSON.stringify({ private: true, type: 'module' }))
  const env = await packAndExtract(packageRoot, temporaryRoot, consumerRoot, 'env')
  const core = await packAndExtract(path.join(repoRoot, 'packages', 'weapp-tailwindcss'), temporaryRoot, consumerRoot, 'core')
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.deepEqual(env.manifest[field] ?? {}, {}, `env ${field} 必须为空`)
  }
  assert.equal(core.manifest.dependencies['@weapp-tailwindcss/env'], env.manifest.version)
  assert.equal((await readdir(env.installed)).includes('src'), false)
  for (const file of ['index.js', 'index.cjs', 'index.d.ts', 'index.d.cts']) {
    assert.ok((await readFile(path.join(env.installed, 'dist', file))).length > 0)
  }

  const runtime = `
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import * as env from '@weapp-tailwindcss/env'
import * as legacy from 'weapp-tailwindcss/framework'
const require = createRequire(import.meta.url)
const cjs = require('@weapp-tailwindcss/env')
const oldCjs = require('weapp-tailwindcss/framework')
assert.deepEqual(Object.keys(env).sort(), Object.keys(cjs).sort())
assert.deepEqual(Object.keys(legacy).sort(), Object.keys(oldCjs).sort())
for (const name of Object.keys(env).filter(name => name !== 'normalizeFrameworkStylePlatform')) {
  assert.equal(legacy[name], env[name])
  assert.equal(oldCjs[name], cjs[name])
}
for (const key of ['TARO_ENV', 'MPX_CLI_MODE', 'MPX_CURRENT_TARGET_MODE', 'WEAPP_TW_TARGET', 'WEAPP_TAILWINDCSS_TARGET']) delete process.env[key]
process.env.UNI_PLATFORM = 'h5'
process.env.UNI_UTS_PLATFORM = 'app-android'
for (const api of [env, cjs, legacy, oldCjs]) {
  assert.equal(api.detectAppTypeFromEnv({}, { cwd: process.cwd() }), undefined)
  assert.equal(api.resolveUniPlatformsFromEnv({}).uniUtsPlatform.normalized, undefined)
  assert.equal(api.resolveUniPlatform().normalized, 'h5')
  assert.equal(api.detectAppTypeFromPackageJson({ dependencies: { 'weapp-vite': '*' } }), 'weapp-vite')
}
assert.equal(env.normalizeFrameworkStylePlatform('wx', 'mpx'), 'mp-weixin')
assert.equal(legacy.resolveImplicitAppTypeFromViteRoot(process.cwd(), { searchUp: false }), undefined)
`
  await writeFile(path.join(consumerRoot, 'runtime.mjs'), runtime)
  run(process.execPath, ['runtime.mjs'], consumerRoot)

  const types = `
import { detectAppType, resolveUniPlatformsFromEnv, normalizeFrameworkStylePlatform } from '@weapp-tailwindcss/env'
import type { DetectableAppType, FrameworkEnv, UniPlatformInfo } from '@weapp-tailwindcss/env'
import { detectAppType as legacyDetect } from 'weapp-tailwindcss/framework'
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T
type AppReturn = Expect<Equal<ReturnType<typeof detectAppType>, DetectableAppType | undefined>>
type LegacyReturn = Expect<Equal<ReturnType<typeof legacyDetect>, DetectableAppType | undefined>>
const snapshot: FrameworkEnv = { UNI_PLATFORM: 'h5' }
const app: DetectableAppType | undefined = detectAppType({ env: snapshot })
const legacy: typeof app = legacyDetect({ env: snapshot })
const info: UniPlatformInfo = resolveUniPlatformsFromEnv(snapshot).uniPlatform
const platform: string | undefined = normalizeFrameworkStylePlatform('wx', 'mpx')
`
  await writeFile(path.join(consumerRoot, 'types.mts'), types)
  await writeFile(path.join(consumerRoot, 'types.cts'), types)
  run(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', 'types.mts', 'types.cts'], consumerRoot)
  process.stdout.write('env 与主包 framework 的 tarball、ESM/CJS、快照隔离和 NodeNext 类型消费验证通过。\n')
}
finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
