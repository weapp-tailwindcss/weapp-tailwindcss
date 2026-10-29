import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { pair } from './fixtures/lock-pair.mjs'
import { auditOptionalCliIsolation, optionalCliOverrides } from './optional-cli.mjs'
import { auditBunyanMetadataSides, bunyanMetadata, bunyanMetadataReference, collectBunyanSource, verifyBunyanSource } from './tool-metadata.mjs'

function sourceInput() {
  const version = { name: bunyanMetadata.name, version: bunyanMetadata.version, engines: { node: '>=0.10.0' }, dist: { integrity: bunyanMetadata.integrity, shasum: bunyanMetadata.tarballSha1, tarball: bunyanMetadata.tarballUrl } }
  return { version, packument: { versions: { '4.0.1': structuredClone(version) } }, manifest: { name: bunyanMetadata.name, version: bunyanMetadata.version, engines: ['node >=0.10.0'] }, integrity: bunyanMetadata.integrity, tarballSha256: bunyanMetadata.tarballSha256, tarballSha1: bunyanMetadata.tarballSha1, manifestSha256: bunyanMetadata.manifestSha256 }
}

function originalLock() {
  const original = pair().current
  original.packages[bunyanMetadata.id] = { resolution: { integrity: bunyanMetadata.integrity } }
  original.packages['webpack@5.91.0'].peerDependencies = { 'webpack-cli': '*' }
  original.packages['webpack@5.91.0'].peerDependenciesMeta = { 'webpack-cli': { optional: true } }
  const compiler = Object.entries(original.snapshots).find(([key]) => key.startsWith('webpack@'))[1]
  compiler.optionalDependencies = { 'webpack-cli': '7.2.3' }
  original.packages['webpack-cli@7.2.3'] = {}
  original.snapshots['webpack-cli@7.2.3'] = {}
  return original
}

function augmented(original) {
  const result = structuredClone(original)
  result.packages[bunyanMetadata.id].engines = { node: '>=0.10.0' }
  return result
}

function isolated(reference) {
  const lock = structuredClone(reference)
  delete lock.packages['webpack@5.91.0'].peerDependencies
  delete lock.packages['webpack@5.91.0'].peerDependenciesMeta
  delete Object.entries(lock.snapshots).find(([key]) => key.startsWith('webpack@'))[1].optionalDependencies
  lock.overrides = { ...lock.overrides, ...optionalCliOverrides }
  return lock
}

test('准确官方 registry 与旧发布 tarball 形态同时绑定 SRI、内容和包身份', () => {
  const result = verifyBunyanSource(sourceInput())
  assert.equal(result.verified, true)
  assert.deepEqual(result.registryEngines, { node: '>=0.10.0' })
  assert.deepEqual(result.tarballEngines, ['node >=0.10.0'])
})

test('来源收集拒绝重定向、HTTP 失败、响应超限、超时和截断，不留下完成收据', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler-metadata-download-'))
  const response = (url, body) => ({ ok: true, url, body })
  async function* chunks(value) { yield value }
  try {
    const cases = [
      async () => response('https://example.invalid/redirect', chunks(Buffer.from('{}'))),
      async () => ({ ok: false, status: 503 }),
      async url => response(url, chunks(Buffer.alloc(1024 * 1024 + 1))),
      async () => { throw new Error('fixture network timeout') },
      async url => response(url, (async function* () { yield Buffer.from('{'); throw new Error('fixture truncated stream') })()),
    ]
    for (const [index, request] of cases.entries()) {
      const destination = path.join(temporary, String(index))
      await assert.rejects(collectBunyanSource(destination, { request: async (url, options) => {
        assert.equal(url, bunyanMetadata.versionUrl)
        assert.equal(options.redirect, 'error')
        assert.ok(options.signal instanceof AbortSignal)
        return request(url)
      } }))
      assert.deepEqual(await fs.readdir(destination), [])
    }
  }
  finally { await fs.rm(temporary, { recursive: true, force: true }) }
})

test('来源收集在解压或读取 manifest 前拒绝内容不符的 tarball', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler-metadata-tarball-'))
  const input = sourceInput()
  try {
    await assert.rejects(collectBunyanSource(path.join(temporary, 'source'), { request: async url => ({
      ok: true, url, body: (async function* () {
        yield url === bunyanMetadata.versionUrl ? Buffer.from(JSON.stringify(input.version)) : url === bunyanMetadata.packumentUrl ? Buffer.from(JSON.stringify(input.packument)) : Buffer.from('invalid gzip payload')
      })(),
    }) }), /解析前必须确认准确发布 tarball/)
    await assert.rejects(fs.access(path.join(temporary, 'source', 'tarball-package.json')), { code: 'ENOENT' })
  }
  finally { await fs.rm(temporary, { recursive: true, force: true }) }
})

test('官方来源拒绝错误包、版本、SRI、engine、URL、内容与 packument 不一致', () => {
  for (const mutate of [
    value => { value.version.name = 'bunyan' },
    value => { value.version.version = '4.0.2' },
    value => { value.packument.versions['4.0.1'].engines.node = '>=26' },
    value => { value.version.engines.extra = true },
    value => { value.version.dist.integrity = 'wrong' },
    value => { value.version.dist.shasum = 'wrong' },
    value => { value.version.dist.tarball = 'https://example.invalid/bunyan.tgz' },
    value => { value.manifest.engines = { node: '>=0.10.0' } },
    value => { value.manifest.name = 'bunyan' },
    value => { value.manifest.version = '4.0.2' },
    value => { value.integrity = 'wrong' },
    value => { value.tarballSha256 = 'wrong' },
    value => { value.tarballSha1 = 'wrong' },
    value => { value.manifestSha256 = 'wrong' },
  ]) {
    const value = sourceInput(); mutate(value)
    assert.throws(() => verifyBunyanSource(value))
  }
})

test('比较参考只补精确遗漏，原对象不变且两侧必须保持同一个完整包条目', () => {
  const original = originalLock(), before = structuredClone(original)
  const { reference, receipt } = bunyanMetadataReference(original, augmented(original), verifyBunyanSource(sourceInput()), 'v22.23.4')
  assert.deepEqual(original, before)
  const expected = structuredClone(original)
  expected.packages[bunyanMetadata.id].engines = { node: '>=0.10.0' }
  assert.deepEqual(reference, expected)
  assert.deepEqual(receipt.runtime, { nodeVersion: 'v22.23.4', actualProcessVersion: process.version, fixtureOverride: process.version !== 'v22.23.4', engine: '>=0.10.0', compatible: true })
  const current = isolated(reference)
  auditOptionalCliIsolation(reference, current, ['webpack@5.91.0'])
  assert.deepEqual(auditBunyanMetadataSides(reference, { current, previous: structuredClone(current) }), ['current', 'previous'])
  current.packages[bunyanMetadata.id].engines.node = '>=26'
  assert.throws(() => auditBunyanMetadataSides(reference, { current }))
  assert.deepEqual(original, before)
})

test('参考拒绝错误 SRI、其它版本、已有 engine、其它字段和不匹配运行 Node', () => {
  for (const mutate of [
    value => { value.packages[bunyanMetadata.id].resolution.integrity = 'wrong' },
    value => { value.packages['@expo/bunyan@4.0.2'] = value.packages[bunyanMetadata.id]; delete value.packages[bunyanMetadata.id] },
    value => { value.packages[bunyanMetadata.id].engines = { node: '>=0.10.0' } },
    value => { value.packages[bunyanMetadata.id].optional = true },
    value => { value.packages[bunyanMetadata.id].resolution.extra = true },
  ]) {
    const value = originalLock(); mutate(value)
    assert.throws(() => bunyanMetadataReference(value, augmented(originalLock()), verifyBunyanSource(sourceInput()), 'v22.23.4'))
  }
  for (const version of ['v22.22.3', 'v24.22.1', 'v0.8.0']) assert.throws(() => bunyanMetadataReference(originalLock(), augmented(originalLock()), verifyBunyanSource(sourceInput()), version))
  const source = verifyBunyanSource(sourceInput()); source.integrity = 'wrong'
  assert.throws(() => bunyanMetadataReference(originalLock(), augmented(originalLock()), source, 'v22.23.4'))
})

test('工具保留缺失字段时参考也保持原样，两侧不能采用不同规范化结果', () => {
  const original = originalLock()
  const { reference, receipt } = bunyanMetadataReference(original, original, verifyBunyanSource(sourceInput()), 'v22.23.4')
  assert.equal(receipt.applied, false)
  assert.deepEqual(reference, original)
  auditOptionalCliIsolation(reference, isolated(reference), ['webpack@5.91.0'])
  assert.throws(() => auditBunyanMetadataSides(reference, { current: original, previous: augmented(original) }))
})

test('对称 metadata 参考不放宽其它 engine、包字段、snapshot 与 importer 绑定', () => {
  const { reference } = bunyanMetadataReference(originalLock(), augmented(originalLock()), verifyBunyanSource(sourceInput()), 'v22.23.4')
  for (const mutate of [
    value => { value.packages['example@1.0.0'].engines = { node: '>=26' } },
    value => { value.packages[bunyanMetadata.id].engines.extra = true },
    value => { value.packages[bunyanMetadata.id].peerDependencies = { webpack: '*' } },
    value => { value.snapshots['example@1.0.0'].optional = true },
    value => { value.snapshots['example@1.0.0'].dependencies = { 'webpack-cli': '7.2.3' } },
    value => { Object.values(value.importers)[0].devDependencies.example.version = '7.2.3' },
  ]) {
    const value = isolated(reference); mutate(value)
    assert.throws(() => auditOptionalCliIsolation(reference, value, ['webpack@5.91.0']))
  }
})
