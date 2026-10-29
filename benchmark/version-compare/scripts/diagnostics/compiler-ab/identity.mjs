import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { installedLockGraph, sameCompilerSources } from './installed-graph.mjs'
import { compilerVersions, projectRelative } from './lock-axis.mjs'
import { readPackage, sha256 } from './package-identity.mjs'
export { fileSha256, readPackage, sha256 } from './package-identity.mjs'

export function compilerIdentity(root, role, expectedCompanions, lock, patchFiles) {
  const project = path.join(root, projectRelative)
  assert.ok(lock?.importers?.[projectRelative], '编译器身份必须绑定已审计的准确锁')
  const importer = lock.importers[projectRelative]
  const seeds = Object.entries({ ...importer.dependencies, ...importer.devDependencies })
    .filter(([name]) => ['webpack', '@tarojs/webpack5-runner', '@tarojs/taro', '@tarojs/taro-loader'].includes(name))
    .map(([name, item]) => ({ from: project, name, reference: item.version, route: `${projectRelative}.${name}` }))
  const installedGraph = installedLockGraph(lock, seeds)
  const byDirectory = new Map(Object.values(installedGraph.bindings).map(identity => [identity.directory, identity]))
  const bound = (from, name) => {
    const identity = readPackage(from, name)
    assert.ok(byDirectory.has(identity.directory), `实际 consumer 不在批准锁图中：${name}`)
    return byDirectory.get(identity.directory)
  }
  const runner = bound(project, '@tarojs/webpack5-runner')
  assert.equal(runner.version, '4.3.1')
  const webpack = bound(runner.directory, 'webpack')
  const projectWebpack = bound(project, 'webpack')
  assert.equal(webpack.version, compilerVersions[role])
  assert.equal(projectWebpack.version, compilerVersions[role])
  const approvedDirectories = new Set([projectWebpack.directory, webpack.directory])
  const compilerContexts = sameCompilerSources(Object.values(installedGraph.bindings).filter(identity => identity.name === 'webpack' && approvedDirectories.has(identity.directory)))
  for (const context of compilerContexts) {
    assert.equal(context.version, compilerVersions[role], '批准编译器版本与本侧目标不符')
    assert.ok(context.patch, '目标编译器必须保留准确补丁身份')
    const patchPath = patchFiles?.[`${context.name}@${context.version}`]
    assert.equal(typeof patchPath, 'string', '目标编译器必须保留准确补丁来源')
    const patchFile = path.resolve(root, patchPath)
    const relative = path.relative(root, patchFile)
    assert.ok(relative && !path.isAbsolute(relative) && relative !== '..' && !relative.startsWith(`..${path.sep}`), '编译器补丁必须位于批准副本内')
    context.patchFileSha256 = sha256(fs.readFileSync(patchFile))
    context.patchFile = patchPath
    context.incoming = Object.entries(lock.snapshots).flatMap(([parent, snapshot]) => ['dependencies', 'optionalDependencies'].flatMap(field => Object.entries(snapshot[field] ?? {}).filter(([name, ref]) => context.key === ref || context.key === `${name}@${ref}`).map(([name]) => ({ parent, field, name }))))
  }
  const direct = Object.fromEntries(Object.entries(expectedCompanions).map(([name, version]) => {
    const identity = bound(webpack.directory, name)
    assert.equal(identity.version, version, `实际编译器配套错误：${name}`)
    return [name, identity]
  }))
  const terserPlugin = bound(runner.directory, 'terser-webpack-plugin')
  const cssPlugin = bound(runner.directory, 'css-minimizer-webpack-plugin')
  const compilerConsumers = Object.fromEntries(['@tarojs/taro-loader', '@tarojs/webpack5-prebundle', 'terser-webpack-plugin', 'css-minimizer-webpack-plugin'].map((name) => {
    const consumer = bound(runner.directory, name)
    const actual = bound(consumer.directory, 'webpack')
    return [name, { consumer, webpack: actual }]
  }))
  const minimizers = {
    terserPlugin, terser: readPackage(terserPlugin.directory, 'terser'),
    cssPlugin, cssnano: readPackage(cssPlugin.directory, 'cssnano'),
    postcss: readPackage(cssPlugin.directory, 'postcss'),
  }
  assert.deepEqual(Object.fromEntries(Object.entries(minimizers).map(([name, value]) => [name, value.version])), {
    terserPlugin: '5.6.1', terser: '5.51.2', cssPlugin: '6.0.0', cssnano: '6.1.2', postcss: '8.5.32',
  }, '两侧必须保持当前 Taro 的真实压缩配套')
  const projectLoader = bound(project, '@tarojs/taro-loader')
  compilerConsumers.projectLoader = { consumer: projectLoader, webpack: bound(projectLoader.directory, 'webpack') }
  const taro = bound(project, '@tarojs/taro')
  const optionalWebpack = bound(taro.directory, 'webpack')
  assert.equal(optionalWebpack.version, compilerVersions[role], '可选编译器必须实际解析本侧 Webpack')
  if (role === 'previous') assert.equal(optionalWebpack.directory, webpack.directory, '旧编译器的可选上下文必须合入目标直接编译器')
  const optionalTerser = bound(optionalWebpack.directory, 'terser-webpack-plugin')
  assert.equal(optionalTerser.version, '5.6.1')
  const mainEsbuild = bound(terserPlugin.directory, 'esbuild')
  const optionalEsbuild = bound(optionalTerser.directory, 'esbuild')
  assert.equal(mainEsbuild.version, '0.21.5', 'runner 主 Terser 的实际 esbuild 身份必须保持')
  assert.equal(optionalEsbuild.version, role === 'current' ? '0.21.5' : '0.28.2', '可选 Terser 必须实际解析合同中的 esbuild')
  const implementation = dependency => Object.fromEntries(['dist/index.js', 'dist/utils.js'].map(file => [file, sha256(fs.readFileSync(path.join(dependency.directory, file)))]))
  const terserImplementation = implementation(terserPlugin)
  assert.deepEqual(implementation(optionalTerser), terserImplementation, '可选编译器的 Terser 实现必须完全相同')
  const esbuildCalls = fs.readFileSync(path.join(terserPlugin.directory, 'dist/utils.js'), 'utf8').match(/\brequire\(["']esbuild["']\)/g)
  assert.equal(esbuildCalls?.length, 2, '固定 Terser 的实际 esbuild 调用锚点必须复查')
  return {
    runner, webpack, projectWebpack, direct, minimizers, compilerConsumers, terserImplementation, mainEsbuild, compilerContexts, installedGraph,
    optionalCompilerContext: { taro, webpack: optionalWebpack, terser: optionalTerser, esbuild: optionalEsbuild },
    compilerFiles: Object.fromEntries(['lib/Compiler.js', 'lib/Compilation.js', 'hot/only-dev-server.js'].map(file => [file, sha256(fs.readFileSync(path.resolve(webpack.directory, file)))])),
    configSha256: sha256(fs.readFileSync(path.join(project, 'config/index.ts'))),
    runnerEntrySha256: sha256(fs.readFileSync(path.join(runner.directory, 'dist/index.mini.js'))),
  }
}

/** 只传递已审计身份的紧凑引用，完整源码清单留在守卫合同文件中。 */
export function observerIdentity(identity) {
  const contexts = identity.compilerContexts.map(context => ({
    key: context.key, directory: context.directory, manifestSha256: context.manifestSha256,
    compilerSha256: context.files[path.join('lib', 'Compiler.js')],
    compilationSha256: context.files[path.join('lib', 'Compilation.js')],
  }))
  return {
    runner: { directory: identity.runner.directory, manifestSha256: identity.runner.manifestSha256, entrySha256: identity.runnerEntrySha256 },
    target: contexts.find(context => context.directory === identity.webpack.directory), contexts,
  }
}
