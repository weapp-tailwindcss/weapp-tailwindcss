import assert from 'node:assert/strict'
import { rootPeerContextKey, target, withoutPeers } from './lock-graph-core.mjs'

/** 明确记录唯一已确认的可选 esbuild 配套上下文合并；其它包图不规范化 esbuild。 */
export function auditOptionalEsbuildMerge(current, previous, projectRelative, versions) {
  if (!current.importers[projectRelative].dependencies?.['@tarojs/taro']) return null
  const contexts = {}
  for (const [side, lock] of Object.entries({ current, previous })) {
    const importer = lock.importers[projectRelative]
    const taro = target(lock, '@tarojs/taro', importer.dependencies['@tarojs/taro'].version)
    const compiler = target(lock, 'webpack', lock.snapshots[taro.key].optionalDependencies.webpack)
    assert.equal(compiler.id, `webpack@${versions[side]}`)
    const terser = target(lock, 'terser-webpack-plugin', lock.snapshots[compiler.key].dependencies['terser-webpack-plugin'])
    assert.equal(terser.id, 'terser-webpack-plugin@5.6.1')
    const snapshot = lock.snapshots[terser.key]
    const esbuild = snapshot.optionalDependencies?.esbuild
    assert.equal(esbuild, side === 'current' ? '0.21.5' : '0.28.2', '只允许已确认的可选 esbuild 上下文合并')
    assert.equal(snapshot.dependencies.webpack, compiler.key.slice('webpack@'.length), 'Terser 必须实际消费对应编译器')
    if (side === 'previous') assert.equal(compiler.key, target(lock, 'webpack', importer.devDependencies.webpack.version).key, '新可选编译器必须合入目标直接编译器')
    contexts[side] = { taroKey: taro.key, compilerKey: compiler.key, terserKey: terser.key, esbuild, snapshot, route: [{ importer: projectRelative, field: 'dependencies', name: '@tarojs/taro' }, { parent: taro.key, field: 'optionalDependencies', name: 'webpack' }, { parent: compiler.key, field: 'dependencies', name: 'terser-webpack-plugin' }] }
  }
  const before = contexts.current, after = contexts.previous
  assert.deepEqual(current.packages['terser-webpack-plugin@5.6.1'], previous.packages['terser-webpack-plugin@5.6.1'], 'Terser 版本/源码 metadata 不允许变化')
  const expected = structuredClone(before.snapshot)
  expected.dependencies.webpack = after.snapshot.dependencies.webpack
  expected.optionalDependencies.esbuild = after.esbuild
  assert.deepEqual(after.snapshot, expected, 'Terser 除明确的编译器与可选 esbuild 绑定外必须逐项相等')
  const mappings = new Map([['webpack@5.91.0', '<compiler>'], ['webpack@5.105.4', '<compiler>'], ['esbuild@0.21.5', '<optional-esbuild>'], ['esbuild@0.28.2', '<optional-esbuild>']])
  assert.equal(rootPeerContextKey(before.terserKey, mappings), rootPeerContextKey(after.terserKey, mappings), 'Terser 其它嵌套 peer 不得改变')
  for (const version of ['0.21.5', '0.28.2']) assert.deepEqual(current.packages[`esbuild@${version}`], previous.packages[`esbuild@${version}`], '其它 esbuild 源码身份必须原样')
  return { label: 'Webpack 编译器及其可选 esbuild peer 上下文 A/B', current: before, previous: after, requirements: ['所有 isolate 禁止实际加载 webpack-cli', '所有 isolate 禁止从 Terser 实现消费 esbuild', '守卫缺证或命中使测量无效'], compilerIdentities: [withoutPeers(before.compilerKey), withoutPeers(after.compilerKey)] }
}
