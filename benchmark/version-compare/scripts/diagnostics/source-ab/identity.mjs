import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { installedLockGraph, sameCompilerSources } from './installed-graph.mjs'
import { readPackage, sha256 } from './package-identity.mjs'
export { fileSha256, readPackage, sha256 } from './package-identity.mjs'

export const projectRelative = 'demo/taro-webpack-react-tailwindcss-v4'

export function compilerIdentity(root, lock) {
  const project = path.join(root, projectRelative)
  const importer = lock.importers[projectRelative]
  assert.ok(importer, '准确锁缺少目标 importer')
  const seeds = Object.entries({ ...importer.dependencies, ...importer.devDependencies })
    .filter(([name]) => ['webpack', '@tarojs/webpack5-runner', '@tarojs/taro', '@tarojs/taro-loader'].includes(name))
    .map(([name, item]) => ({ from: project, name, reference: item.version, route: `${projectRelative}.${name}` }))
  const installedGraph = installedLockGraph(lock, seeds)
  const approved = new Map(Object.values(installedGraph.bindings).map(value => [value.directory, value]))
  const bound = (from, name) => {
    const actual = readPackage(from, name)
    assert.ok(approved.has(actual.directory), `实际依赖不在准确锁闭包：${name}`)
    return approved.get(actual.directory)
  }
  const runner = bound(project, '@tarojs/webpack5-runner')
  const webpack = bound(runner.directory, 'webpack')
  const projectWebpack = bound(project, 'webpack')
  assert.equal(runner.version, '4.3.1')
  assert.equal(webpack.version, '5.91.0')
  assert.equal(projectWebpack.version, '5.91.0')
  const directories = new Set([webpack.directory, projectWebpack.directory])
  const compilerContexts = sameCompilerSources(Object.values(installedGraph.bindings).filter(value => value.name === 'webpack' && directories.has(value.directory)))
  const terserPlugin = bound(runner.directory, 'terser-webpack-plugin')
  const cssPlugin = bound(runner.directory, 'css-minimizer-webpack-plugin')
  const minimizers = { terserPlugin, cssPlugin, terser: readPackage(terserPlugin.directory, 'terser'), cssnano: readPackage(cssPlugin.directory, 'cssnano'), postcss: readPackage(cssPlugin.directory, 'postcss') }
  const taro = bound(project, '@tarojs/taro')
  const optionalWebpack = bound(taro.directory, 'webpack')
  const optionalTerser = bound(optionalWebpack.directory, 'terser-webpack-plugin')
  return {
    runner, webpack, projectWebpack, compilerContexts, minimizers, installedGraph,
    optionalCompilerContext: { taro, webpack: optionalWebpack, terser: optionalTerser },
    configSha256: sha256(fs.readFileSync(path.join(project, 'config/index.ts'))),
    runnerEntrySha256: sha256(fs.readFileSync(path.join(runner.directory, 'dist/index.mini.js'))),
  }
}

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
