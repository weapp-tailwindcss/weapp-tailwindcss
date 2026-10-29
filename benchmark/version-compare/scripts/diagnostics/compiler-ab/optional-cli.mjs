import assert from 'node:assert/strict'
import { auditNonAxisGraph, optionalCliContextKey } from './lock-graph.mjs'

export const optionalCliOverrides = { 'webpack@5.91.0>webpack-cli': '-', 'webpack@5.105.4>webpack-cli': '-', 'webpack-dev-server@4.15.2>webpack-cli': '-' }

export function isolateOptionalCliWorkspace(document) {
  for (const [selector, value] of Object.entries(optionalCliOverrides)) document.setIn(['overrides', selector], value)
  return document
}

function withoutOptionalPeer(metadata) {
  assert.equal(metadata.peerDependencies?.['webpack-cli'], '*', '只隔离已确认 consumer 的可选 CLI peer')
  assert.deepEqual(metadata.peerDependenciesMeta?.['webpack-cli'], { optional: true })
  const expected = structuredClone(metadata)
  for (const field of ['peerDependencies', 'peerDependenciesMeta']) {
    delete expected[field]['webpack-cli']
    if (!Object.keys(expected[field]).length) delete expected[field]
  }
  return expected
}

const select = (values, predicate) => Object.fromEntries(Object.entries(values).filter(([key]) => predicate(key)))

function auditCliContexts(original, isolated, consumers) {
  const before = select(original.snapshots, key => key.startsWith('webpack-cli@'))
  const after = select(isolated.snapshots, key => key.startsWith('webpack-cli@'))
  assert.deepEqual(Object.keys(after).sort(), Object.keys(before).sort(), 'CLI 的三个既有 peer context 身份必须保持')
  for (const [key, value] of Object.entries(before)) {
    const expected = structuredClone(value)
    for (const field of ['dependencies', 'optionalDependencies']) {
      const oldRef = value[field]?.['webpack-dev-server']
      const newRef = after[key][field]?.['webpack-dev-server']
      if (oldRef === newRef) continue
      assert.equal(field, 'optionalDependencies', '只允许 CLI 的可选 dev-server 边传播已授权上下文变化')
      const oldKey = `webpack-dev-server@${oldRef}`
      const newKey = `webpack-dev-server@${newRef}`
      assert.ok(original.snapshots[oldKey] && isolated.snapshots[newKey], 'CLI 引用必须有完整实际 snapshot')
      assert.ok(consumers.has(oldKey.split('(')[0]) && consumers.has(newKey.split('(')[0]), 'CLI 改绑了未授权 dev-server')
      assert.equal(optionalCliContextKey(oldKey, consumers), optionalCliContextKey(newKey, consumers), 'CLI 的实际 dev-server/Webpack 绑定改变')
      expected[field]['webpack-dev-server'] = newRef
    }
    assert.deepEqual(after[key], expected, 'CLI 的其它边或完整 metadata 必须原样保留')
  }
  return Object.keys(before)
}

/** 对称隔离只移除编译器与旧 dev-server 自身的可选 CLI 边；其余源码身份、解析图和 CLI 上下文保持。 */
export function auditOptionalCliIsolation(original, isolated, consumerIds = ['webpack@5.91.0', 'webpack-dev-server@4.15.2']) {
  const expectedMetadata = Object.fromEntries(consumerIds.map(id => [id, withoutOptionalPeer(original.packages[id])]))
  assert.deepEqual(isolated.packages, { ...original.packages, ...expectedMetadata }, '可选 CLI 隔离改变了其它包 metadata')
  const metadata = lock => Object.fromEntries(Object.entries(lock).filter(([key]) => !['packages', 'snapshots', 'importers', 'overrides'].includes(key)))
  assert.deepEqual(metadata(original), metadata(isolated), '可选 CLI 隔离改变了锁配置或补丁')
  assert.deepEqual(isolated.overrides, { ...original.overrides, ...optionalCliOverrides }, '只能增加精确的已授权 consumer 可选 CLI 移除规则')
  const preservedCliContexts = auditCliContexts(original, isolated, new Set(consumerIds))
  for (const field of ['packages', 'snapshots']) {
    const modern = key => key === 'webpack@5.112.2' || key.startsWith('webpack@5.112.2(')
    assert.deepEqual(select(original[field], modern), select(isolated[field], modern), '现代 Webpack 5.112.2 不属于隔离范围')
  }
  for (const id of consumerIds) {
    const snapshots = select(isolated.snapshots, key => key.split('(')[0] === id)
    assert.ok(Object.keys(snapshots).length > 0, `隔离后缺少 consumer snapshot：${id}`)
    for (const value of Object.values(snapshots)) {
      assert.ok(!Object.hasOwn(value.dependencies ?? {}, 'webpack-cli') && !Object.hasOwn(value.optionalDependencies ?? {}, 'webpack-cli'), `consumer 仍保留 CLI 边：${id}`)
    }
  }
  auditNonAxisGraph(original, isolated, new Set(), { versions: {}, optionalCliConsumers: new Set(consumerIds) })
  return { consumerIds, removedPeer: 'webpack-cli', preservedCliContexts }
}
