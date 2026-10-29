import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { sha256 } from '../package-identity.mjs'
import { outputManifest } from '../measure.mjs'
import { verifyAssetSnapshot, verifyPhaseAssetArchives } from './verify.mjs'

const require = createRequire(import.meta.url)
const { createAssetArchive } = require('./archive.cjs')
const { assetOwnership } = require('./ownership.cjs')
const { assetEvidence } = require('../preload.cjs')
const binding = { role: 'current', run: 1, sourceIdentity: { ref: 'a'.repeat(40), archiveSha256: 'b'.repeat(64) } }
const compiler = { key: 'webpack@fixture', directory: '/compiler', compilerSha256: 'c'.repeat(64), compilationSha256: 'd'.repeat(64) }
const descriptor = { compilation: 1, phase: 'after-process-assets', compiler }

async function fixture(action) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler asset bytes '))
  try { await action(root) }
  finally { await fs.rm(root, { recursive: true, force: true }) }
}

function compilation(source, name = 'app.js') {
  const module = { identifier: () => 'loader!C:\\project\\src\\page.tsx?type=script', resource: 'C:\\project\\src\\page.tsx', type: 'javascript/auto', buildInfo: { hash: 'original-build-hash', assets: { 'standalone.bin': {} } } }
  const chunk = { id: 7, name: 'main', files: new Set([name]), auxiliaryFiles: new Set(['main.map']) }
  return {
    getAssets: () => [{ name, source, info: {} }], modules: new Set([module]), chunks: new Set([chunk]),
    chunkGraph: { getModuleId: () => 12, getChunkModulesIterable: () => [module] },
    hooks: { processAssets: { taps: [{ name: 'original-plugin', type: 'async', stage: 400 }] }, afterProcessAssets: { taps: [] } },
  }
}

test('阶段归档复用一次source读取的完整二进制，危险逻辑名不成为磁盘路径，图身份保持原样', async () => fixture(async (root) => {
  const archiveRoot = path.join(root, 'archive')
  const archive = createAssetArchive(archiveRoot, binding)
  const bytes = Buffer.from([0, 255, 13, 10])
  let reads = 0
  const source = { source() { reads += 1; return bytes }, size: () => bytes.length, map() { throw new Error('禁止map') } }
  const value = compilation(source, '../C:\\logical\\app.js')
  const evidence = assetEvidence(value, archive)
  const ownership = assetOwnership(value, evidence.manifest)
  const receipt = archive.snapshot(descriptor, evidence.manifest, ownership)
  const snapshot = verifyAssetSnapshot(archiveRoot, receipt, binding, descriptor, evidence.manifest)
  assert.equal(reads, 1)
  assert.deepEqual(await fs.readFile(path.join(archiveRoot, evidence.manifest[0].body.file)), bytes)
  assert.deepEqual(snapshot.ownership.assets[0].chunks, [0])
  assert.equal(snapshot.ownership.modules[0].identifier, 'loader!C:\\project\\src\\page.tsx?type=script')
  assert.equal(snapshot.ownership.modules[0].resource, 'C:\\project\\src\\page.tsx')
  assert.equal(snapshot.ownership.modules[0].buildHash, 'original-build-hash')
  assert.equal(snapshot.ownership.taps.processAssets[0].name, 'original-plugin')
  assert.equal((await fs.readdir(path.join(archiveRoot, 'bytes'))).length, 1)
  assert.deepEqual(archive.store(bytes, sha256(bytes)), evidence.manifest[0].body)
  verifyPhaseAssetArchives([{ type: 'phase', number: 1, phase: descriptor.phase, compiler, ...evidence, assetArchive: receipt }], archiveRoot, binding)
}))

test('快照绑定源码/侧/轮次/编译器/阶段，缺失或正文篡改均失败', async () => fixture(async (root) => {
  assert.throws(() => createAssetArchive(path.join(root, 'bad'), { ...binding, sourceIdentity: undefined }), /源码 SHA/)
  const archiveRoot = path.join(root, 'archive')
  const archive = createAssetArchive(archiveRoot, binding)
  const bytes = Buffer.from('original')
  const body = archive.store(bytes, sha256(bytes))
  const manifest = [{ name: 'app.js', bytes: bytes.length, sha256: body.sha256, body }]
  const receipt = archive.snapshot(descriptor, manifest, {})
  assert.throws(() => verifyAssetSnapshot(archiveRoot, receipt, { ...binding, run: 2 }, descriptor, manifest), /源码\/侧\/轮次/)
  assert.throws(() => verifyAssetSnapshot(archiveRoot, receipt, binding, { ...descriptor, compiler: { ...compiler, key: 'other' } }, manifest), /compiler 身份/)
  assert.throws(() => verifyAssetSnapshot(archiveRoot, { ...receipt, file: '../escaped' }, binding, descriptor, manifest), /路径/)
  assert.throws(() => verifyPhaseAssetArchives([{ type: 'phase', number: 1, phase: descriptor.phase, compiler, manifest }], archiveRoot, binding), /路径/)
  await fs.writeFile(path.join(archiveRoot, body.file), Buffer.from('modified'))
  assert.throws(() => verifyAssetSnapshot(archiveRoot, receipt, binding, descriptor, manifest), /摘要/)
}))

test('回执JSON同次Buffer摘要先验，正文链接/缺失/快照覆盖/错误摘要都不能放行', async () => fixture(async (root) => {
  const archiveRoot = path.join(root, 'archive')
  const archive = createAssetArchive(archiveRoot, binding)
  const bytes = Buffer.from('raw')
  assert.throws(() => archive.store(bytes, 'e'.repeat(64)), /同次观测摘要/)
  const body = archive.store(bytes, sha256(bytes))
  const manifest = [{ name: 'app.js', bytes: bytes.length, sha256: body.sha256, body }]
  const receipt = archive.snapshot(descriptor, manifest, {})
  assert.throws(() => archive.snapshot(descriptor, manifest, {}), /EEXIST/)
  const filename = path.join(archiveRoot, body.file)
  await fs.rm(filename)
  assert.throws(() => verifyAssetSnapshot(archiveRoot, receipt, binding, descriptor, manifest), /ENOENT/)
  const elsewhere = path.join(root, 'external.bin')
  await fs.writeFile(elsewhere, bytes)
  await fs.symlink(elsewhere, filename)
  assert.throws(() => verifyAssetSnapshot(archiveRoot, receipt, binding, descriptor, manifest), /符号链接/)
  const snapshot = path.join(archiveRoot, receipt.file)
  await fs.writeFile(snapshot, '{}\n')
  assert.throws(() => verifyAssetSnapshot(archiveRoot, receipt, binding, descriptor, manifest), /长度|摘要/)
}))

test('归档与归属图有固定上限，未知chunk成员与超限内容失败而非截断', async () => fixture(async (root) => {
  const archive = createAssetArchive(path.join(root, 'archive'), binding, { assetBytes: 3, totalBytes: 4, snapshots: 1 })
  assert.throws(() => archive.store(Buffer.from('four'), sha256('four')), /单资产/)
  archive.store(Buffer.from('abc'), sha256('abc'))
  assert.throws(() => archive.store(Buffer.from('de'), sha256('de')), /总量/)
  archive.snapshot(descriptor, [], {})
  assert.throws(() => archive.snapshot({ ...descriptor, compilation: 2 }, [], {}), /快照数量/)
  const value = compilation({ source: () => '', size: () => 0 })
  value.chunkGraph.getChunkModulesIterable = () => [{}]
  assert.throws(() => assetOwnership(value, []), /compilation 以外/)
  delete value.chunkGraph
  assert.throws(() => assetOwnership(value, []), /chunkGraph/)
}))

test('最终产物复用现有readFile字节归档并与阶段归属明确区分', async () => fixture(async (root) => {
  const dist = path.join(root, 'dist')
  await fs.mkdir(dist)
  await fs.writeFile(path.join(dist, 'final.bin'), Buffer.from([0, 128, 255]))
  const archiveRoot = path.join(root, 'emitted')
  const archive = createAssetArchive(archiveRoot, binding)
  const manifest = await outputManifest(dist, archive)
  const emitted = { ...descriptor, compilation: null, phase: 'emitted-output' }
  const receipt = archive.snapshot(emitted, manifest, { source: 'emitted-filesystem' })
  const snapshot = verifyAssetSnapshot(archiveRoot, receipt, binding, emitted, manifest)
  assert.equal(snapshot.ownership.source, 'emitted-filesystem')
  assert.deepEqual(await fs.readFile(path.join(archiveRoot, manifest[0].body.file)), Buffer.from([0, 128, 255]))
}))

test('相同正文去重不允许后续资产借用摘要绕过路径或重复名检查', async () => fixture(async (root) => {
  const archiveRoot = path.join(root, 'archive')
  const archive = createAssetArchive(archiveRoot, binding)
  const bytes = Buffer.from('same')
  const body = archive.store(bytes, sha256(bytes))
  const asset = { name: 'one.js', bytes: bytes.length, sha256: body.sha256, body }
  assert.throws(() => archive.snapshot(descriptor, [asset, asset], {}), /重复逻辑名/)
  const manifest = [asset, { ...asset, name: 'two.js', body: { ...body, file: '../outside' } }]
  const receipt = archive.snapshot(descriptor, manifest, {})
  assert.throws(() => verifyAssetSnapshot(archiveRoot, receipt, binding, descriptor, manifest), /正文路径/)
}))

test('同SHA后续逻辑资产的双重伪造长度必须与首次实读长度比较', async () => fixture(async (root) => {
  const archiveRoot = path.join(root, 'archive')
  const archive = createAssetArchive(archiveRoot, binding)
  const bytes = Buffer.from('abc')
  const body = archive.store(bytes, sha256(bytes))
  const asset = { name: 'one.js', bytes: bytes.length, sha256: body.sha256, body }
  const manifest = [asset, { ...asset, name: 'two.js', bytes: 4, body: { ...body, bytes: 4 } }]
  const receipt = archive.snapshot(descriptor, manifest, {})
  assert.throws(() => verifyAssetSnapshot(archiveRoot, receipt, binding, descriptor, manifest), /已实读正文/)
}))
