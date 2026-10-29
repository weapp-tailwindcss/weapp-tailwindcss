const assert = require('node:assert/strict')
const { createHash } = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')

const digest = value => createHash('sha256').update(value).digest('hex')
const phases = new Set(['before-optimize-size', 'after-optimize-size', 'after-process-assets', 'emitted-output'])

function validateBinding(binding) {
  assert.ok(['current', 'previous'].includes(binding?.role), '资产归档缺少准确侧身份')
  assert.ok([1, 2, 3].includes(binding?.run), '资产归档缺少准确轮次')
  assert.match(binding?.sourceIdentity?.ref ?? '', /^[a-f\d]{40}$/, '资产归档缺少准确源码 SHA')
  assert.match(binding?.sourceIdentity?.archiveSha256 ?? '', /^[a-f\d]{64}$/, '资产归档缺少源码 archive SHA256')
}

function validateDescriptor(descriptor) {
  assert.ok(phases.has(descriptor?.phase), '资产归档阶段无效')
  assert.ok(descriptor.phase === 'emitted-output' ? descriptor.compilation === null : Number.isSafeInteger(descriptor.compilation) && descriptor.compilation > 0, '资产归档 compilation 无效')
  assert.ok(descriptor.compiler?.key && descriptor.compiler?.directory, '资产归档缺少真实编译器身份')
  for (const field of ['compilerSha256', 'compilationSha256']) assert.match(descriptor.compiler[field] ?? '', /^[a-f\d]{64}$/, '资产归档缺少真实编译器源码摘要')
}

/** 资产名仅保留为逻辑字段，磁盘对象只使用正文摘要命名。 */
function createAssetArchive(directory, binding, limits = {}) {
  validateBinding(binding)
  const maximum = { assetBytes: 32 * 1024 * 1024, totalBytes: 128 * 1024 * 1024, snapshots: 64, snapshotBytes: 32 * 1024 * 1024, ...limits }
  const root = path.resolve(directory)
  fs.mkdirSync(root)
  fs.mkdirSync(path.join(root, 'bytes'))
  fs.mkdirSync(path.join(root, 'snapshots'))
  const stored = new Map()
  let totalBytes = 0
  let snapshots = 0
  return {
    store(contents, expectedSha256) {
      assert.ok(Buffer.isBuffer(contents), '资产归档必须复用已读取的 Buffer')
      assert.ok(contents.length <= maximum.assetBytes, '单资产正文超过归档上限，拒绝截断')
      const sha256 = digest(contents)
      assert.equal(sha256, expectedSha256, '资产正文与同次观测摘要不符')
      if (stored.has(sha256)) return stored.get(sha256)
      assert.ok(totalBytes + contents.length <= maximum.totalBytes, '资产正文总量超过归档上限，拒绝截断')
      const file = path.join('bytes', `${sha256}.bin`)
      fs.writeFileSync(path.join(root, file), contents, { flag: 'wx' })
      const receipt = { file, sha256, bytes: contents.length }
      stored.set(sha256, receipt)
      totalBytes += contents.length
      return receipt
    },
    snapshot(descriptor, assets, ownership) {
      validateDescriptor(descriptor)
      assert.ok(snapshots < maximum.snapshots, '资产快照数量超过归档上限')
      assert.ok(Array.isArray(assets) && assets.every(asset => asset.body?.sha256 === asset.sha256 && asset.body?.bytes === asset.bytes), '资产快照缺少同次正文回执')
      assert.equal(new Set(assets.map(asset => asset.name)).size, assets.length, '资产快照存在重复逻辑名')
      const value = { schemaVersion: 1, binding, descriptor, assets, ownership }
      const bytes = Buffer.from(`${JSON.stringify(value)}\n`)
      assert.ok(bytes.length <= maximum.snapshotBytes, '资产归属图超过归档上限，拒绝截断')
      const file = path.join('snapshots', `${descriptor.compilation ?? 'final'}-${descriptor.phase}.json`)
      fs.writeFileSync(path.join(root, file), bytes, { flag: 'wx' })
      snapshots += 1
      return { file, bytes: bytes.length, sha256: digest(bytes) }
    },
  }
}

function phaseArchiveDirectory(file) {
  return path.join(path.dirname(file), `${path.basename(file)}-assets`)
}

module.exports = { createAssetArchive, phaseArchiveDirectory, validateBinding, validateDescriptor }
