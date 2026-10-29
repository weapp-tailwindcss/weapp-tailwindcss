import assert from 'node:assert/strict'
import test from 'node:test'
import { stringify } from 'yaml'
import { auditLockAxis, projectRelative } from './lock-axis.mjs'
import { auditLockDocuments, parseLockDocuments } from './lock-documents.mjs'

function lock(version, sourceVersion) {
  const reference = `${version}(patch_hash=fixture-${version})(peer@1.0.0)`
  return {
    lockfileVersion: '9.0',
    settings: { autoInstallPeers: true },
    catalogs: { tools: { example: { specifier: '^1.0.0', version: '1.0.0' } } },
    overrides: { existing: '1.0.0' },
    patchedDependencies: { [`webpack@${version}`]: { hash: `fixture-${version}`, path: `patches/webpack@${version}.patch` } },
    importers: { [projectRelative]: { devDependencies: { webpack: { specifier: '5.91.0', version: reference }, example: { specifier: '^1.0.0', version: '1.0.0' } } } },
    packages: Object.fromEntries([`webpack@${version}`, `webpack-sources@${sourceVersion}`, 'example@1.0.0', '@tarojs/webpack5-runner@4.3.1', 'terser-webpack-plugin@5.6.1'].map(key => [key, { resolution: { integrity: key } }])),
    snapshots: {
      [`webpack@${reference}`]: { dependencies: { 'webpack-sources': sourceVersion, 'terser-webpack-plugin': '5.6.1' } },
      [`webpack-sources@${sourceVersion}`]: {},
      'example@1.0.0': {},
      'terser-webpack-plugin@5.6.1': {},
      [`@tarojs/webpack5-runner@4.3.1(webpack@${version})`]: { dependencies: { webpack: reference, example: '1.0.0' } },
    },
  }
}

function pair() {
  const current = lock('5.91.0', '3.6.0')
  const baseline = lock('5.105.4', '3.5.1')
  const previous = structuredClone(baseline)
  previous.overrides = { existing: '1.0.0', 'webpack@5.91.0': '5.105.4', 'webpack@5.105.4>webpack-sources': '3.5.1', 'webpack@5.105.4>terser-webpack-plugin': '5.6.1' }
  return { current, previous, baseline }
}

test('锁轴允许准确编译器配套和可读、压缩 peer key 传播', () => {
  const { current, previous, baseline } = pair()
  const audit = auditLockAxis(current, previous, baseline)
  assert.deepEqual(audit.companionChanges, [{ name: 'webpack-sources', current: '3.6.0', previous: '3.5.1' }])
  assert.ok(audit.peerKeyChanges.added.some(key => key.startsWith('@tarojs/webpack5-runner@')))
  for (const [index, item] of [current, previous].entries()) {
    const key = Object.keys(item.snapshots).find(key => key.startsWith('@tarojs/webpack5-runner@'))
    const compressed = `@tarojs/webpack5-runner@4.3.1(${'a'.repeat(31)}${index})`
    item.snapshots[compressed] = item.snapshots[key]
    delete item.snapshots[key]
    item.snapshots['example@1.0.0'].dependencies = { runner: compressed }
  }
  auditLockAxis(current, previous, baseline)
})

test('锁轴阻断无关版本、补丁、metadata、override、边和 catalog 漂移', () => {
  const { current, previous, baseline } = pair()
  for (const mutate of [
    item => { item.packages['example@1.0.0'].resolution.integrity = 'other' },
    item => { item.snapshots['example@1.0.0'].dependencies = { unrelated: '2.0.0' } },
    item => { item.snapshots['example@1.0.0'].optional = true },
    item => { item.settings.autoInstallPeers = false },
    item => { item.packageExtensionsChecksum = 'unrelated' },
    item => { item.overrides.unrelated = '2.0.0' },
    item => { item.patchedDependencies['example@1.0.0'] = { hash: 'unrelated', path: 'example.patch' } },
    item => { item.catalogs.tools.example.version = '1.0.1' },
    item => { item.importers[projectRelative].devDependencies.example.version = '1.0.1' },
    item => {
      const key = Object.keys(item.snapshots).find(key => key.startsWith('@tarojs/webpack5-runner@'))
      delete item.snapshots[key].dependencies.webpack
    },
    item => { item.snapshots['example@1.0.0'].dependencies = { webpack: item.importers[projectRelative].devDependencies.webpack.version } },
  ]) {
    const changed = structuredClone(previous)
    mutate(changed)
    assert.throws(() => auditLockAxis(current, changed, baseline))
  }
  const changed = structuredClone(previous)
  changed.snapshots[Object.keys(changed.snapshots).find(key => key.startsWith('webpack@'))].dependencies['webpack-sources'] = '3.5.0'
  assert.throws(() => auditLockAxis(current, changed, baseline), /准确 base0e9/)
})

test('锁轴保留非轴包自身 patch hash，即便补丁 map 两侧都被相同篡改', () => {
  const { current, previous, baseline } = pair()
  for (const item of [current, previous]) {
    item.patchedDependencies['example@1.0.0'] = { hash: 'example-patch', path: 'example.patch' }
    item.snapshots['example@1.0.0(patch_hash=example-patch)'] = item.snapshots['example@1.0.0']
    delete item.snapshots['example@1.0.0']
    item.importers[projectRelative].devDependencies.example.version = '1.0.0(patch_hash=example-patch)'
    const runner = Object.keys(item.snapshots).find(key => key.startsWith('@tarojs/webpack5-runner@'))
    item.snapshots[runner].dependencies.example = '1.0.0(patch_hash=example-patch)'
  }
  auditLockAxis(current, previous, baseline)
  previous.snapshots['example@1.0.0(patch_hash=wrong)'] = previous.snapshots['example@1.0.0(patch_hash=example-patch)']
  delete previous.snapshots['example@1.0.0(patch_hash=example-patch)']
  assert.throws(() => auditLockAxis(current, previous, baseline), /补丁身份/)
})

test('锁轴拒绝将 consumer 切到另一个已存在的非编译器 peer snapshot', () => {
  const { current, previous, baseline } = pair()
  for (const item of [current, previous]) {
    item.packages['foo@1.0.0'] = {}
    item.snapshots['foo@1.0.0(peer@1.0.0)'] = {}
    item.snapshots['foo@1.0.0(peer@2.0.0)'] = {}
    item.snapshots['example@1.0.0'].dependencies = { foo: '1.0.0(peer@1.0.0)' }
  }
  auditLockAxis(current, previous, baseline)
  previous.snapshots['example@1.0.0'].dependencies.foo = '1.0.0(peer@2.0.0)'
  assert.throws(() => auditLockAxis(current, previous, baseline), /peer 绑定/)
})

test('锁轴拒绝无关 peer 的嵌套改名和不透明上下文的歧义', () => {
  const { current, previous, baseline } = pair()
  const rename = (item, suffix) => {
    const key = Object.keys(item.snapshots).find(key => key.startsWith('@tarojs/webpack5-runner@'))
    item.snapshots[`${key}(unrelated@${suffix})`] = item.snapshots[key]
    delete item.snapshots[key]
  }
  rename(current, '1.0.0')
  rename(previous, '2.0.0')
  assert.throws(() => auditLockAxis(current, previous, baseline), /peer 绑定/)
  const value = pair()
  for (const item of [value.current, value.previous]) {
    const key = Object.keys(item.snapshots).find(key => key.startsWith('@tarojs/webpack5-runner@'))
    for (const char of ['a', 'b']) item.snapshots[`@tarojs/webpack5-runner@4.3.1(${char.repeat(32)})`] = structuredClone(item.snapshots[key])
    delete item.snapshots[key]
  }
  assert.throws(() => auditLockAxis(value.current, value.previous, value.baseline), /不透明 peer context 存在歧义/)
})

test('锁图保留已存在 opaque peer context 的真实绑定，不因编译器可达而混同', () => {
  const { current, previous, baseline } = pair()
  for (const item of [current, previous]) {
    item.packages['foo@1.0.0'] = {}
    const webpack = item.importers[projectRelative].devDependencies.webpack.version
    for (const [index, char] of ['a', 'b'].entries()) {
      const peer = `${index + 1}.0.0`
      item.packages[`peer@${peer}`] = {}
      item.snapshots[`peer@${peer}`] = {}
      item.snapshots[`foo@1.0.0(${char.repeat(32)})`] = { dependencies: { webpack, peer } }
    }
    item.snapshots['example@1.0.0'].dependencies = { foo: `1.0.0(${'a'.repeat(32)})` }
  }
  auditLockAxis(current, previous, baseline)
  previous.snapshots['example@1.0.0'].dependencies.foo = `1.0.0(${'b'.repeat(32)})`
  assert.throws(() => auditLockAxis(current, previous, baseline), /peer 绑定/)
})

test('scoped 配套切换不能改变闭包之外 consumer 或 importer 的准确引用', () => {
  const { current, previous, baseline } = pair()
  previous.packages['webpack-sources@3.6.0'] = structuredClone(current.packages['webpack-sources@3.6.0'])
  previous.snapshots['webpack-sources@3.6.0'] = {}
  for (const item of [current, previous]) {
    item.snapshots['example@1.0.0'].dependencies = { 'webpack-sources': '3.6.0' }
    item.importers[projectRelative].devDependencies['webpack-sources'] = { specifier: '^3.0.0', version: '3.6.0' }
  }
  auditLockAxis(current, previous, baseline)
  const changedConsumer = structuredClone(previous)
  changedConsumer.snapshots['example@1.0.0'].dependencies['webpack-sources'] = '3.5.1'
  assert.throws(() => auditLockAxis(current, changedConsumer, baseline), /peer 绑定/)
  const changedImporter = structuredClone(previous)
  changedImporter.importers[projectRelative].devDependencies['webpack-sources'].version = '3.5.1'
  assert.throws(() => auditLockAxis(current, changedImporter, baseline), /importer/)
})

test('多 document 锁明确领取 workspace，工具链和根 importer 不合并且跨侧不漂移', () => {
  const { current, previous } = pair()
  const toolchain = { lockfileVersion: '9.0', importers: { '.': { devDependencies: { pnpm: { version: '12.15.0' } } } }, packages: {}, snapshots: {} }
  current.importers['.'] = { devDependencies: { root: { version: '1.0.0' } } }
  previous.importers['.'] = structuredClone(current.importers['.'])
  const source = item => `${stringify(toolchain)}---\n${stringify(item)}`
  const parsed = parseLockDocuments(source(current))
  assert.deepEqual(parsed.lock, current)
  assert.deepEqual(parsed.auxiliaryDocuments, [toolchain])
  assert.notDeepEqual(parsed.lock.importers['.'], toolchain.importers['.'])
  auditLockDocuments(parsed, parseLockDocuments(source(previous)))
  const changed = parseLockDocuments(source(previous))
  changed.auxiliaryDocuments[0].importers['.'].devDependencies.pnpm.version = '13.0.0'
  assert.throws(() => auditLockDocuments(parsed, changed), /非 workspace/)
  assert.throws(() => parseLockDocuments(stringify(toolchain)), /只有一段/)
  assert.throws(() => parseLockDocuments(`${source(current)}---\n${stringify(current)}`), /只有一段/)
  assert.throws(() => parseLockDocuments('invalid: [broken'), /YAML 无效/)
})
