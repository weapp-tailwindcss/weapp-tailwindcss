import assert from 'node:assert/strict'
import test from 'node:test'
import { auditLockAxis, projectRelative } from './lock-axis.mjs'
import { pair } from './fixtures/lock-pair.mjs'

const oldKey = `opaque@1.0.0(${'a'.repeat(32)})`
const newKey = `opaque@1.0.0(${'b'.repeat(32)})`

function split() {
  const result = pair()
  const { current, previous } = result
  const oldRef = current.importers[projectRelative].devDependencies.webpack.version
  for (const field of ['packages', 'snapshots']) for (const [key, value] of Object.entries(current[field])) if (!previous[field][key]) previous[field][key] = structuredClone(value)
  for (const item of [current, previous]) {
    item.packages['opaque@1.0.0'] = { peerDependencies: { webpack: '^5' } }
    for (const version of ['1.0.0', '2.0.0']) { item.packages[`peer@${version}`] = {}; item.snapshots[`peer@${version}`] = {} }
    item.snapshots[oldKey] = { dependencies: { webpack: oldRef, peer: '1.0.0' } }
    item.importers.other = { dependencies: { opaque: { specifier: '1.0.0', version: oldKey } }, devDependencies: { runner: structuredClone(item.importers[projectRelative].devDependencies.runner) } }
  }
  current.importers[projectRelative].devDependencies.opaque = { specifier: '1.0.0', version: oldKey }
  previous.importers[projectRelative].devDependencies.opaque = { specifier: '1.0.0', version: newKey }
  previous.snapshots[newKey] = { dependencies: { webpack: previous.importers[projectRelative].devDependencies.webpack.version, peer: '1.0.0' } }
  return result
}

test('逐 importer 保留非目标旧 context，目标 manifest 产生唯一新 opaque context，精确 Taro parent 自带路径授权', () => {
  const { current, previous, baseline } = split()
  const result = auditLockAxis(current, previous, baseline)
  assert.equal(result.graph.importers.length, 2)
  assert.deepEqual(previous.snapshots[oldKey], current.snapshots[oldKey])
  assert.ok(result.graph.provenance.changes.find(change => change.key === newKey).previous.every(route => route.project === projectRelative && route.authority))
})

test('逐 importer 拒绝非目标改绑、clone metadata/非轴边漂移和第三 clone，保留一般 opaque 歧义守卫', () => {
  for (const mutate of [
    item => { item.importers.other.dependencies.opaque.version = newKey },
    item => { item.snapshots[newKey].optional = true },
    item => { item.snapshots[newKey].dependencies.peer = '2.0.0' },
    item => {
      const third = `opaque@1.0.0(${'c'.repeat(32)})`
      item.snapshots[third] = structuredClone(item.snapshots[newKey])
      item.importers[projectRelative].devDependencies.second = { specifier: '1.0.0', version: third }
    },
    item => { item.snapshots[`opaque@1.0.0(${'c'.repeat(32)})`] = structuredClone(item.snapshots[newKey]) },
  ]) {
    const { current, previous, baseline } = split()
    mutate(previous)
    assert.throws(() => auditLockAxis(current, previous, baseline))
  }
})

test('轴包在非轴路径仍消费时须保留完整 snapshot；不可达快照逐项原样', () => {
  const value = split()
  const key = `webpack@${value.current.importers[projectRelative].devDependencies.webpack.version}`
  value.previous.snapshots[key].optional = true
  assert.throws(() => auditLockAxis(value.current, value.previous, value.baseline), /非轴路径消费/)
  const changedSource = split()
  changedSource.previous.packages['webpack@5.91.0'].resolution.integrity = 'different-source'
  assert.throws(() => auditLockAxis(changedSource.current, changedSource.previous, changedSource.baseline), /非轴路径消费的轴包源码/)
  const clean = split()
  for (const item of [clean.current, clean.previous]) { item.packages['unused@1.0.0'] = {}; item.snapshots['unused@1.0.0'] = {} }
  auditLockAxis(clean.current, clean.previous, clean.baseline)
  clean.previous.snapshots['unused@1.0.0'].optional = true
  assert.throws(() => auditLockAxis(clean.current, clean.previous, clean.baseline), /不可达 snapshot/)
})

test('未经精确 parent 授权的非目标路径不能把已存在的旧 Webpack 绑到新版本', () => {
  const { current, previous, baseline } = split()
  for (const item of [current, previous]) {
    item.packages['unapproved@1.0.0'] = {}
    item.snapshots['unapproved@1.0.0'] = { dependencies: { webpack: item.importers[projectRelative].devDependencies.webpack.version } }
    item.importers.other.devDependencies.unapproved = { specifier: '1.0.0', version: '1.0.0' }
  }
  assert.throws(() => auditLockAxis(current, previous, baseline), /peer 绑定/)
})

test('目标 provider 变化不能重绑普通固定依赖或不兼容的非 Taro peer', () => {
  for (const peer of [undefined, '5.91.0']) {
    const { current, previous, baseline } = split()
    for (const item of [current, previous]) item.packages['opaque@1.0.0'] = peer ? { peerDependencies: { webpack: peer } } : {}
    assert.throws(() => auditLockAxis(current, previous, baseline), /peer 绑定|附着边/)
  }
})

test('目标 importer 未变的别名 Webpack 声明不借用 webpack manifest 的切换授权', () => {
  const { current, previous, baseline } = split()
  for (const item of [current, previous]) item.importers[projectRelative].devDependencies.alias = { specifier: '5.91.0', version: `webpack@${item.importers[projectRelative].devDependencies.webpack.version}` }
  assert.throws(() => auditLockAxis(current, previous, baseline), /importer/)
})
