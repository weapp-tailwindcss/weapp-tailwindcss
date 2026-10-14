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
  assert.deepEqual(api.resolvePlatformIdentity(' WX ', 'mpx'), { raw: ' WX ', normalized: 'wx', canonical: 'mp-weixin' })
  assert.equal(api.resolvePlatformIdentity('weapp', 'taro').canonical, 'mp-weixin')
  assert.equal(api.resolvePlatformIdentity('mp-weixin', 'uni-app').canonical, 'mp-weixin')
  assert.equal(api.resolvePlatformIdentity('ali', 'mpx').canonical, 'mp-alipay')
  assert.equal(api.resolvePlatformIdentity('dd', 'mpx').canonical, 'mp-dingtalk')
  assert.equal(api.resolvePlatformIdentity('ali', 'taro').canonical, undefined)
  assert.equal(api.resolvePlatformIdentity('dd').canonical, undefined)
  assert.equal(api.resolvePlatformIdentity('constructor', 'mpx').canonical, undefined)
  assert.equal(api.resolvePlatformIdentity('__proto__', 'mpx').canonical, undefined)
  assert.equal(api.resolvePlatformIdentity('h5').canonical, 'web')
  assert.equal(api.resolvePlatformIdentity('app').canonical, 'app')
  assert.equal(api.resolvePlatformIdentity('app-plus').canonical, 'app-plus')
  assert.deepEqual(api.resolvePlatformIdentity(undefined), { raw: undefined, normalized: undefined, canonical: undefined })
  assert.equal(api.resolveMpxPlatform('ali').isMp, true)
  assert.equal(api.resolveMpxPlatform('dd').isMp, true)
  assert.equal(Object.hasOwn(api.resolvePlatform('h5'), 'canonical'), false)
  assert.deepEqual(api.detectAppTypeReport({ env: {}, cwd: process.cwd() }), { appType: undefined, candidates: [], conflicts: [] })
  const options = { packageJson: { dependencies: { '@tarojs/runtime': '*' }, scripts: { lint: 'eslint weapp-vite.config.ts' } }, env: { MPX_CLI_MODE: 'wx' } }
  const report = api.detectAppTypeReport(options)
  assert.equal(report.appType, api.detectAppType(options))
  assert.equal(report.appType, 'taro')
  assert.equal(report.candidates.length, 1)
  assert.equal(report.candidates[0].appType, 'taro')
  assert.ok(report.candidates[0].evidence.some(item => item.source === 'dependency' && item.key === 'dependencies.@tarojs/runtime' && item.value === '*'))
  assert.deepEqual(report.conflicts, [])
  const mixed = api.detectAppTypeReport({ packageJson: { dependencies: { 'weapp-vite': '*', '@mpxjs/core': '*', '@tarojs/runtime': '*' } } })
  assert.equal(mixed.appType, 'weapp-vite')
  assert.deepEqual(mixed.candidates.map(item => item.appType), ['weapp-vite', 'mpx', 'taro'])
  assert.deepEqual(mixed.conflicts, ['mpx', 'taro'])
}
assert.equal(env.normalizeFrameworkStylePlatform('wx', 'mpx'), 'mp-weixin')
assert.equal(env.normalizeFrameworkStylePlatform('constructor', 'mpx'), 'constructor')
assert.equal(env.normalizeFrameworkStylePlatform('__proto__', 'mpx'), '__proto__')
assert.equal(legacy.resolveImplicitAppTypeFromViteRoot(process.cwd(), { searchUp: false }), undefined)
`
  await writeFile(path.join(consumerRoot, 'runtime.mjs'), runtime)
  run(process.execPath, ['runtime.mjs'], consumerRoot)

  const types = `
import { detectAppType, detectAppTypeReport, resolvePlatformIdentity, resolveUniPlatformsFromEnv, normalizeFrameworkStylePlatform } from '@weapp-tailwindcss/env'
import type { AppTypeDetectionCandidate, AppTypeDetectionEvidence, AppTypeDetectionReport, CanonicalPlatform, DetectableAppType, FrameworkEnv, PlatformIdentityInfo, UniPlatformInfo } from '@weapp-tailwindcss/env'
import { detectAppType as legacyDetect, detectAppTypeReport as legacyReport, resolvePlatformIdentity as legacyIdentity } from 'weapp-tailwindcss/framework'
import type { AppTypeDetectionCandidate as LegacyCandidate, AppTypeDetectionEvidence as LegacyEvidence, AppTypeDetectionReport as LegacyReport, CanonicalPlatform as LegacyCanonical, PlatformIdentityInfo as LegacyIdentity } from 'weapp-tailwindcss/framework'
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<T extends true> = T
type AppReturn = Expect<Equal<ReturnType<typeof detectAppType>, DetectableAppType | undefined>>
type LegacyReturn = Expect<Equal<ReturnType<typeof legacyDetect>, DetectableAppType | undefined>>
type ReportReturn = Expect<Equal<ReturnType<typeof detectAppTypeReport>, AppTypeDetectionReport>>
type IdentityReturn = Expect<Equal<ReturnType<typeof resolvePlatformIdentity>, PlatformIdentityInfo>>
type IdentityContext = Expect<Equal<Parameters<typeof resolvePlatformIdentity>[1], DetectableAppType | undefined>>
type LegacyReportReturn = Expect<Equal<ReturnType<typeof legacyReport>, AppTypeDetectionReport>>
type LegacyIdentityReturn = Expect<Equal<ReturnType<typeof legacyIdentity>, PlatformIdentityInfo>>
type LegacyIdentityContext = Expect<Equal<Parameters<typeof legacyIdentity>[1], DetectableAppType | undefined>>
type Canonical = Expect<Equal<PlatformIdentityInfo['canonical'], CanonicalPlatform | undefined>>
type KnownCanonical = Expect<Equal<CanonicalPlatform, 'mp-weixin' | 'mp-alipay' | 'mp-baidu' | 'mp-qq' | 'mp-toutiao' | 'mp-jd' | 'mp-dingtalk' | 'web' | 'app' | 'app-plus' | 'app-android' | 'app-ios' | 'app-harmony'>>
type IdentityRaw = Expect<Equal<PlatformIdentityInfo['raw'], string | undefined>>
type IdentityNormalized = Expect<Equal<PlatformIdentityInfo['normalized'], string | undefined>>
type ReportApp = Expect<Equal<AppTypeDetectionReport['appType'], DetectableAppType | undefined>>
type ReportCandidates = Expect<Equal<AppTypeDetectionReport['candidates'], AppTypeDetectionCandidate[]>>
type ReportConflicts = Expect<Equal<AppTypeDetectionReport['conflicts'], DetectableAppType[]>>
type CandidateEvidence = Expect<Equal<AppTypeDetectionCandidate['evidence'], AppTypeDetectionEvidence[]>>
type EvidenceSource = Expect<Equal<AppTypeDetectionEvidence['source'], 'manifest' | 'dependency' | 'script' | 'package-field' | 'marker' | 'env' | 'hbuilderx'>>
type LegacyTypeExports = Expect<Equal<[LegacyCandidate, LegacyEvidence, LegacyReport, LegacyCanonical, LegacyIdentity], [AppTypeDetectionCandidate, AppTypeDetectionEvidence, AppTypeDetectionReport, CanonicalPlatform, PlatformIdentityInfo]>>
const snapshot: FrameworkEnv = { UNI_PLATFORM: 'h5' }
const app: DetectableAppType | undefined = detectAppType({ env: snapshot })
const legacy: typeof app = legacyDetect({ env: snapshot })
const info: UniPlatformInfo = resolveUniPlatformsFromEnv(snapshot).uniPlatform
const platform: string | undefined = normalizeFrameworkStylePlatform('wx', 'mpx')
const identity: PlatformIdentityInfo = resolvePlatformIdentity('wx', 'mpx')
const canonical: CanonicalPlatform | undefined = identity.canonical
const report: AppTypeDetectionReport = detectAppTypeReport({ env: snapshot })
const legacyDetectionReport: AppTypeDetectionReport = legacyReport({ env: snapshot })
const legacyPlatformIdentity: PlatformIdentityInfo = legacyIdentity(undefined)
`
  await writeFile(path.join(consumerRoot, 'types.mts'), types)
  await writeFile(path.join(consumerRoot, 'types.cts'), types)
  run(process.execPath, [require.resolve('typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--target', 'ES2022', 'types.mts', 'types.cts'], consumerRoot)
  process.stdout.write('env 与主包 framework 的 tarball、ESM/CJS、平台身份、检测报告、快照隔离和 NodeNext 类型消费验证通过。\n')
}
finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
