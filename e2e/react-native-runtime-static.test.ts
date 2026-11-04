import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { reactNativeVersions } from './react-native/catalog'
import { exampleRoot } from './react-native/generation-input'
import { assertRuntimeStaticBaseline, prepareRuntimeStaticEvidence } from './react-native/runtime-static'

const require = createRequire(import.meta.url)
const baselineFile = path.join(exampleRoot, 'src', 'compatibility', 'static-evidence.json')
const baselineSource = readFileSync(baselineFile, 'utf8')
const baseline = JSON.parse(baselineSource)
let directory: string
let generated: typeof baseline
let prepared: Awaited<ReturnType<typeof prepareRuntimeStaticEvidence>>

beforeAll(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'rn-runtime-static-'))
  prepared = await prepareRuntimeStaticEvidence(directory)
  generated = JSON.parse(await readFile(prepared.file, 'utf8'))
})

afterAll(async () => {
  if (directory) {
    await rm(directory, { recursive: true, force: true })
  }
})

it('本轮真实生成绑定当前依赖及摘要，已提交基线保持逐字不变', async () => {
  expect(generated.report.versions).toEqual(reactNativeVersions())
  expect(await readFile(baselineFile, 'utf8')).toBe(baselineSource)
  const sha256 = createHash('sha256').update(await readFile(prepared.file)).digest('hex')
  expect(prepared.environment.RN_RUNTIME_STATIC_EVIDENCE_SHA256).toBe(sha256)
  expect(JSON.parse(await readFile(path.join(directory, 'runtime-static-input.json'), 'utf8'))).toMatchObject({
    generatedSha256: sha256,
    baselineSha256: createHash('sha256').update(baselineSource).digest('hex'),
    versions: reactNativeVersions(),
  })
})

it('合法发布只改变编译器版本时，重新生成的输入可用且保留新版本', () => {
  const versioned = structuredClone(generated)
  versioned.report.versions.compiler = '999.0.1'
  expect(() => assertRuntimeStaticBaseline(baseline, versioned)).not.toThrow()
  expect(versioned.report.versions.compiler).toBe('999.0.1')
})

it.each(['manifest', 'rawCss', 'generation', 'results', 'catalogHash', 'fixtureHash', 'dependencies', 'extra'] as const)('编译器升版不能掩盖 %s 漂移', (kind) => {
  const changed = structuredClone(generated)
  changed.report.versions.compiler = '999.0.1'
  if (kind === 'dependencies') {
    changed.report.versions.tailwindcss = '999.0.1'
  }
  else if (kind === 'results') {
    changed.report.results.pop()
  }
  else if (kind === 'generation') {
    changed.generation.runtimeInput.config.source += '\n/* 未审查入口 */'
  }
  else if (kind === 'manifest') {
    changed.manifest.classSet.pop()
  }
  else if (kind === 'rawCss') {
    changed.rawCss += '\n.unknown { color: red; }'
  }
  else {
    changed[kind] = '未审查变更'
  }
  expect(() => assertRuntimeStaticBaseline(baseline, changed)).toThrow('基线')
})

it('Metro 只重定向原构建图确认的静态模块，并保留已有 resolver', () => {
  const { withRuntimeStaticEvidence } = require('./react-native/runtime-static-config.cjs')
  const original = { type: 'sourceFile', filePath: baselineFile }
  const foreign = { type: 'sourceFile', filePath: path.join(exampleRoot, 'foreign', 'static-evidence.json') }
  const resolve = vi.fn().mockReturnValueOnce(original).mockReturnValueOnce(foreign)
  const originalResolver = { resolveRequest: resolve, extra: true }
  const config = withRuntimeStaticEvidence({ resolver: originalResolver, watchFolders: ['existing'] }, exampleRoot, prepared.environment)
  const context = { resolveRequest: vi.fn() }
  expect(config.resolver.resolveRequest(context, './compatibility/static-evidence.json', 'web')).toEqual({ type: 'sourceFile', filePath: prepared.file })
  expect(config.resolver.resolveRequest(context, './foreign/static-evidence.json', 'ios')).toBe(foreign)
  expect(resolve.mock.calls).toEqual([[context, './compatibility/static-evidence.json', 'web'], [context, './foreign/static-evidence.json', 'ios']])
  expect(context.resolveRequest).not.toHaveBeenCalled()
  expect(resolve.mock.contexts).toEqual([originalResolver, originalResolver])
  expect(config.resolver.extra).toBe(true)
  expect(config.watchFolders).toEqual(['existing', path.dirname(prepared.file)])
  expect(config.cacheVersion).toContain(prepared.environment.RN_RUNTIME_STATIC_EVIDENCE_SHA256)
  expect(() => withRuntimeStaticEvidence({}, exampleRoot, { ...prepared.environment, RN_RUNTIME_STATIC_EVIDENCE_SHA256: '0'.repeat(64) })).toThrow('摘要')
})

it.each([path.posix, path.win32])('resolver 在 %s 路径语义下精确匹配根目录与相对模块', (paths) => {
  const module = { exports: {} as { withRuntimeStaticEvidence: (...args: any[]) => any } }
  const source = readFileSync(new URL('./react-native/runtime-static-config.cjs', import.meta.url), 'utf8')
  runInNewContext(source, { module, require: (id: string) => id === 'node:path' ? paths : id === 'node:fs' ? { readFileSync: () => Buffer.from('input') } : require(id) })
  const root = paths.resolve(paths === path.win32 ? 'C:\\仓库 space' : '/仓库 space')
  const input = paths.join(root, 'artifacts', 'static-evidence.json')
  const sha256 = createHash('sha256').update('input').digest('hex')
  const resolver = module.exports.withRuntimeStaticEvidence({}, root, { RN_RUNTIME_STATIC_EVIDENCE: input, RN_RUNTIME_STATIC_EVIDENCE_SHA256: sha256 }).resolver
  const resolveRequest = vi.fn(() => ({ type: 'sourceFile', filePath: paths.join(root, 'src', 'compatibility', 'static-evidence.json') }))
  expect(resolver.resolveRequest({ resolveRequest }, './static-evidence.json', 'android').filePath).toBe(input)
  expect(() => module.exports.withRuntimeStaticEvidence({}, root, { RN_RUNTIME_STATIC_EVIDENCE: 'relative.json', RN_RUNTIME_STATIC_EVIDENCE_SHA256: sha256 })).toThrow('路径')
})
