import fs from 'node:fs/promises'
import path from 'node:path'
import { observerIdentity, readPackage, sha256 } from './identity.mjs'
import { packageFiles } from './installed-graph.mjs'

/** 两份源码完全相同的 Compiler 通过真实 Node 模块边界消费不同 peer。 */
export async function compilerFixture(root) {
  async function file(relative, content) {
    const filename = path.join(root, ...relative)
    await fs.mkdir(path.dirname(filename), { recursive: true })
    await fs.writeFile(filename, content)
    return filename
  }
  await file(['package.json'], '{}')
  const runner = await file(['node_modules', '@tarojs', 'webpack5-runner', 'package.json'], JSON.stringify({ name: '@tarojs/webpack5-runner', version: '4.3.1', main: 'dist/index.mini.js' }))
  await file(['node_modules', '@tarojs', 'webpack5-runner', 'dist', 'index.mini.js'], 'module.exports = require("webpack/lib/Compiler.js")')
  const compiler = `
    const assert = require('node:assert/strict');
    class Hook { constructor() { this.taps = [] } tap(options, fn) { this.taps.push({ stage: options.stage || 0, fn }) } call() { for (const tap of this.taps.sort((a,b) => a.stage-b.stage)) tap.fn() } }
    class TerserPlugin { constructor() { this.options = { parallel: true } } }
    class CssMinimizerPlugin { constructor() { this.options = { parallel: true } } }
    module.exports = class Compiler {
      constructor() { this.options = { mode: 'production', cache: false, resolve: { mainFields: ['main:mini', 'module', 'main'] }, optimization: { minimize: true, minimizer: [new TerserPlugin(), new CssMinimizerPlugin()] } } }
      newCompilation(token) {
        assert.equal(this.token, token);
        if (require('compiler-peer') === 'direct' && token !== 'allowed-direct') throw new Error('original direct compiler exception');
        let value = 'before';
        const source = { source: () => value, size: () => Buffer.byteLength(value), map: () => { throw new Error('source.map called') } };
        const hooks = { processAssets: new Hook(), afterProcessAssets: new Hook() };
        hooks.processAssets.tap({ stage: 400 }, () => { value = 'after' });
        return { original: token, hooks, modules: new Set([1, 2]), chunks: new Set([1]), getAssets: () => [{ name: 'app.js', source, info: {} }] };
      }
    };
  `
  const direct = ['node_modules', 'webpack']
  const nested = ['node_modules', '@tarojs', 'webpack5-runner', 'node_modules', 'webpack']
  const contexts = []
  for (const [parts, peer] of [[direct, 'direct'], [nested, 'runner']]) {
    await file([...parts, 'package.json'], JSON.stringify({ name: 'webpack', version: '5.91.0' }))
    await file([...parts, 'lib', 'Compiler.js'], compiler)
    await file([...parts, 'lib', 'Compilation.js'], 'module.exports = { PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE: 400 }')
    const peerRoot = [...parts.slice(0, -1), 'compiler-peer']
    await file([...peerRoot, 'package.json'], JSON.stringify({ name: 'compiler-peer', version: peer === 'direct' ? '1.0.0' : '2.0.0', main: 'index.cjs' }))
    await file([...peerRoot, 'index.cjs'], `module.exports = ${JSON.stringify(peer)}`)
    const identity = readPackage(path.join(root, ...parts, '..'), 'webpack')
    contexts.push({ ...identity, key: `webpack@5.91.0(compiler-peer@${peer === 'direct' ? '1.0.0' : '2.0.0'})`, files: packageFiles(identity.directory) })
  }
  const runnerIdentity = readPackage(root, '@tarojs/webpack5-runner')
  const identity = { runner: runnerIdentity, runnerEntrySha256: sha256(await fs.readFile(path.join(path.dirname(runner), 'dist', 'index.mini.js'))), webpack: contexts[1], compilerContexts: contexts }
  const binding = observerIdentity(identity)
  const lock = {
    packages: Object.fromEntries(['webpack@5.91.0', 'compiler-peer@1.0.0', 'compiler-peer@2.0.0'].map(name => [name, { resolution: { integrity: `fixture:${name}` } }])),
    snapshots: Object.fromEntries(contexts.map((context, index) => [context.key, { dependencies: { 'compiler-peer': index === 0 ? '1.0.0' : '2.0.0' } }])),
  }
  lock.snapshots['compiler-peer@1.0.0'] = {}
  lock.snapshots['compiler-peer@2.0.0'] = {}
  const seeds = contexts.map((context, index) => ({ from: index === 0 ? root : runnerIdentity.directory, name: 'webpack', reference: context.key, route: index === 0 ? 'project.webpack' : 'runner.webpack' }))
  return { file, identity, binding, contexts, lock, seeds }
}
