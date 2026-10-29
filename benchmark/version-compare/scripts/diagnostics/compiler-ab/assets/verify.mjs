import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { sha256 } from '../package-identity.mjs'

const { validateBinding, validateDescriptor } = createRequire(import.meta.url)('./archive.cjs')

function readReceipt(root, receipt, expectedFile, maximum) {
  assert.equal(receipt?.file, expectedFile, '资产回执路径与固定摘要/阶段不符')
  const filename = path.join(root, expectedFile)
  assert.equal(fs.realpathSync(filename), filename, '资产回执不得跟随符号链接')
  const stat = fs.lstatSync(filename)
  assert.ok(stat.isFile() && stat.size <= maximum, '资产回执必须为未超限的普通文件')
  const bytes = fs.readFileSync(filename)
  assert.equal(bytes.length, receipt.bytes, '资产回执长度不符')
  assert.equal(sha256(bytes), receipt.sha256, '资产回执摘要不符')
  return bytes
}

/** 快照与正文先核对同一 Buffer 的摘要再消费，不接受缺失、越界或截断证据。 */
export function verifyAssetSnapshot(directory, receipt, binding, descriptor, manifest) {
  validateBinding(binding)
  validateDescriptor(descriptor)
  assert.ok(fs.lstatSync(directory).isDirectory(), '资产归档根必须为独占普通目录')
  const root = fs.realpathSync(directory)
  const file = path.join('snapshots', `${descriptor.compilation ?? 'final'}-${descriptor.phase}.json`)
  const snapshot = JSON.parse(readReceipt(root, receipt, file, 32 * 1024 * 1024))
  assert.equal(snapshot.schemaVersion, 1)
  assert.deepEqual(snapshot.binding, binding, '资产快照源码/侧/轮次身份不符')
  assert.deepEqual(snapshot.descriptor, descriptor, '资产快照 compilation/phase/compiler 身份不符')
  assert.deepEqual(snapshot.assets, manifest, '资产快照与同次观测 manifest 不符')
  const verified = new Map()
  for (const asset of snapshot.assets) {
    assert.match(asset.sha256, /^[a-f\d]{64}$/, '资产摘要无效')
    assert.equal(asset.body?.sha256, asset.sha256, '资产与正文摘要不符')
    assert.equal(asset.body?.bytes, asset.bytes, '资产与正文长度不符')
    const filename = path.join('bytes', `${asset.sha256}.bin`)
    assert.equal(asset.body?.file, filename, '资产正文路径与固定摘要不符')
    if (!verified.has(asset.sha256)) {
      const contents = readReceipt(root, asset.body, filename, 32 * 1024 * 1024)
      verified.set(asset.sha256, { bytes: contents.length, sha256: sha256(contents) })
    }
    const actual = verified.get(asset.sha256)
    assert.equal(asset.bytes, actual.bytes, '逻辑资产声明长度与已实读正文不符')
    assert.equal(asset.sha256, actual.sha256, '逻辑资产声明摘要与已实读正文不符')
  }
  return snapshot
}

export function verifyPhaseAssetArchives(records, directory, binding) {
  for (const record of records.filter(item => item.type === 'phase')) {
    const descriptor = { compilation: record.number, phase: record.phase, compiler: record.compiler }
    const snapshot = verifyAssetSnapshot(directory, record.assetArchive, binding, descriptor, record.manifest)
    assert.equal(snapshot.ownership?.source, 'webpack-compilation-graph', '缺少真实资产归属图')
    assert.equal(snapshot.ownership.modules.length, record.modules)
    assert.equal(snapshot.ownership.chunks.length, record.chunks)
    assert.deepEqual(snapshot.ownership.assets.map(asset => asset.name), record.manifest.map(asset => asset.name))
  }
}
