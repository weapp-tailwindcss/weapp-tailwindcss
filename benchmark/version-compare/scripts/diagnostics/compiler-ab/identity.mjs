import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { compilerVersions, projectRelative } from './lock-axis.mjs'

export const sha256 = value => createHash('sha256').update(value).digest('hex')

export async function fileSha256(file) {
  const digest = createHash('sha256')
  for await (const chunk of fs.createReadStream(file)) digest.update(chunk)
  return digest.digest('hex')
}

export function readPackage(from, name) {
  const require = createRequire(path.join(from, 'package.json'))
  let file
  try { file = require.resolve(`${name}/package.json`) }
  catch {
    let directory = path.dirname(require.resolve(name))
    for (;;) {
      const candidate = path.join(directory, 'package.json')
      if (fs.existsSync(candidate) && JSON.parse(fs.readFileSync(candidate, 'utf8')).name === name) {
        file = candidate
        break
      }
      const parent = path.dirname(directory)
      assert.notEqual(parent, directory, `无法定位依赖 manifest：${name}`)
      directory = parent
    }
  }
  const realFile = fs.realpathSync(file)
  const manifest = JSON.parse(fs.readFileSync(realFile, 'utf8'))
  assert.equal(manifest.name, name, `依赖 manifest 身份不符：${name}`)
  return { name: manifest.name, version: manifest.version, directory: path.dirname(realFile), manifestSha256: sha256(fs.readFileSync(realFile)) }
}

export function compilerIdentity(root, role, expectedCompanions) {
  const project = path.join(root, projectRelative)
  const runner = readPackage(project, '@tarojs/webpack5-runner')
  assert.equal(runner.version, '4.3.1')
  const webpack = readPackage(runner.directory, 'webpack')
  assert.equal(webpack.version, compilerVersions[role])
  assert.equal(readPackage(project, 'webpack').directory, webpack.directory, 'demo 与 runner 必须消费同一个实际编译器')
  const direct = Object.fromEntries(Object.entries(expectedCompanions).map(([name, version]) => {
    const identity = readPackage(webpack.directory, name)
    assert.equal(identity.version, version, `实际编译器配套错误：${name}`)
    return [name, identity]
  }))
  const terserPlugin = readPackage(runner.directory, 'terser-webpack-plugin')
  const cssPlugin = readPackage(runner.directory, 'css-minimizer-webpack-plugin')
  const compilerConsumers = Object.fromEntries(['@tarojs/taro-loader', '@tarojs/webpack5-prebundle', 'terser-webpack-plugin', 'css-minimizer-webpack-plugin'].map((name) => {
    const consumer = readPackage(runner.directory, name)
    const actual = readPackage(consumer.directory, 'webpack')
    assert.equal(actual.directory, webpack.directory, `编译器 consumer 解析到其它 Webpack：${name}`)
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
  const taro = readPackage(project, '@tarojs/taro')
  const optionalWebpack = readPackage(taro.directory, 'webpack')
  assert.equal(optionalWebpack.version, compilerVersions[role], '可选编译器必须实际解析本侧 Webpack')
  if (role === 'previous') assert.equal(optionalWebpack.directory, webpack.directory, '旧编译器的可选上下文必须合入目标直接编译器')
  const optionalTerser = readPackage(optionalWebpack.directory, 'terser-webpack-plugin')
  assert.equal(optionalTerser.version, '5.6.1')
  const mainEsbuild = readPackage(terserPlugin.directory, 'esbuild')
  const optionalEsbuild = readPackage(optionalTerser.directory, 'esbuild')
  assert.equal(mainEsbuild.version, '0.28.2', '目标直接 Terser 的实际 esbuild 身份必须保持')
  assert.equal(optionalEsbuild.version, role === 'current' ? '0.21.5' : '0.28.2', '可选 Terser 必须实际解析合同中的 esbuild')
  const implementation = dependency => Object.fromEntries(['dist/index.js', 'dist/utils.js'].map(file => [file, sha256(fs.readFileSync(path.join(dependency.directory, file)))]))
  const terserImplementation = implementation(terserPlugin)
  assert.deepEqual(implementation(optionalTerser), terserImplementation, '可选编译器的 Terser 实现必须完全相同')
  const esbuildCalls = fs.readFileSync(path.join(terserPlugin.directory, 'dist/utils.js'), 'utf8').match(/\brequire\(["']esbuild["']\)/g)
  assert.equal(esbuildCalls?.length, 2, '固定 Terser 的实际 esbuild 调用锚点必须复查')
  return {
    runner, webpack, direct, minimizers, compilerConsumers, terserImplementation, mainEsbuild,
    optionalCompilerContext: { taro, webpack: optionalWebpack, terser: optionalTerser, esbuild: optionalEsbuild },
    compilerFiles: Object.fromEntries(['lib/Compiler.js', 'lib/Compilation.js', 'hot/only-dev-server.js'].map(file => [file, sha256(fs.readFileSync(path.resolve(webpack.directory, file)))])),
    configSha256: sha256(fs.readFileSync(path.join(project, 'config/index.ts'))),
  }
}
