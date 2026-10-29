import assert from 'node:assert/strict'
import test from 'node:test'
import { auditOptionalEsbuildMerge } from './optional-esbuild.mjs'

function fixture() {
  const project = 'target', versions = { current: '5.91.0', previous: '5.105.4' }, result = { project, versions }
  for (const side of ['current', 'previous']) {
    const version = versions[side], esbuild = side === 'current' ? '0.21.5' : '0.28.2'
    const compiler = `${version}(esbuild@${esbuild})`, taro = `4.3.1(webpack@${version})`, terser = `5.6.1(esbuild@${esbuild})(peer@1.0.0)(webpack@${version})`
    result[side] = {
      importers: { [project]: { dependencies: { '@tarojs/taro': { version: taro } }, devDependencies: { webpack: { version: compiler } } } },
      packages: { 'terser-webpack-plugin@5.6.1': { integrity: 'same-source' }, 'esbuild@0.21.5': { integrity: 'old-esbuild' }, 'esbuild@0.28.2': { integrity: 'new-esbuild' } },
      snapshots: {
        [`@tarojs/taro@${taro}`]: { optionalDependencies: { webpack: compiler } },
        [`webpack@${compiler}`]: { dependencies: { 'terser-webpack-plugin': terser } },
        [`terser-webpack-plugin@${terser}`]: { dependencies: { webpack: compiler, unchanged: '1.0.0' }, optionalDependencies: { esbuild, peer: '1.0.0' } },
      },
    }
  }
  return result
}

test('唯一可选 esbuild 合同保留完整旧/新附着路径、Terser 源码及其它绑定', () => {
  const { current, previous, project, versions } = fixture()
  const contract = auditOptionalEsbuildMerge(current, previous, project, versions)
  assert.equal(contract.current.esbuild, '0.21.5')
  assert.equal(contract.previous.esbuild, '0.28.2')
  assert.equal(contract.current.route.length, 3)
  assert.ok(contract.label.includes('可选 esbuild'))
})

test('可选 esbuild 合同拒绝额外 metadata、其它 binding/嵌套 peer、Terser 源码和第三 esbuild 身份漂移', () => {
  for (const mutate of [
    item => { Object.entries(item.snapshots).find(([key]) => key.startsWith('terser-webpack-plugin@'))[1].optional = true },
    item => { Object.entries(item.snapshots).find(([key]) => key.startsWith('terser-webpack-plugin@'))[1].dependencies.unchanged = '2.0.0' },
    item => { Object.entries(item.snapshots).find(([key]) => key.startsWith('terser-webpack-plugin@'))[1].optionalDependencies.esbuild = '0.29.0' },
    item => { item.packages['terser-webpack-plugin@5.6.1'].integrity = 'different-code' },
    item => { item.packages['esbuild@0.21.5'].integrity = 'different-code' },
    item => {
      const [key, value] = Object.entries(item.snapshots).find(([key]) => key.startsWith('terser-webpack-plugin@'))
      const changed = key.replace('(peer@1.0.0)', '(peer@1.0.0(nested@2.0.0))')
      item.snapshots[changed] = value
      delete item.snapshots[key]
      Object.entries(item.snapshots).find(([key]) => key.startsWith('webpack@'))[1].dependencies['terser-webpack-plugin'] = changed.slice('terser-webpack-plugin@'.length)
    },
  ]) {
    const { current, previous, project, versions } = fixture()
    mutate(previous)
    assert.throws(() => auditOptionalEsbuildMerge(current, previous, project, versions))
  }
})
