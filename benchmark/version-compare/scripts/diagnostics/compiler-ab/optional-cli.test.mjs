import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { create } from 'tar'
import { parseAllDocuments, stringify } from 'yaml'
import { sha256 } from './identity.mjs'
import { auditOptionalCliIsolation, optionalCliOverrides } from './optional-cli.mjs'
import { assertProcessesStopped, runOwned } from './owned-process.mjs'

async function fixture(legacyContext = false) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler-optional-cli-'))
  const workspace = path.join(temporary, 'workspace')
  try {
    const packages = path.join(temporary, 'packages')
    await fs.mkdir(packages)
    const pack = async (name, version, fields) => {
      const root = path.join(packages, `${name}-${version}`)
      await fs.mkdir(root)
      await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name, version, main: 'index.cjs', ...fields }))
      await fs.writeFile(path.join(root, 'index.cjs'), `module.exports = ${JSON.stringify({ name, version })}\n`)
      const tarball = path.join(packages, `${name}-${version}.tgz`)
      await create({ gzip: true, file: tarball, cwd: root, prefix: 'package' }, ['package.json', 'index.cjs'])
      return `file:${tarball}`
    }
    const optional = { peerDependencies: { 'webpack-cli': '*' }, peerDependenciesMeta: { 'webpack-cli': { optional: true } } }
    const compiler = await pack('webpack', '5.91.0', optional)
    const modern = await pack('webpack', '5.112.2', optional)
    const cli = await pack('webpack-cli', '7.2.3', { peerDependencies: { webpack: '*', 'webpack-dev-server': '*' }, peerDependenciesMeta: { 'webpack-dev-server': { optional: true } } })
    const legacyServer = await pack('webpack-dev-server', '4.15.2', { ...optional, peerDependencies: { ...optional.peerDependencies, webpack: '*' } })
    const server = await pack('webpack-dev-server', '5.2.7', { peerDependencies: { webpack: '*' } })
    const runner = await pack('fixture-runner', '1.0.0', { dependencies: { webpack: compiler, 'webpack-dev-server': legacyServer } })
    await fs.mkdir(path.join(workspace, 'target'), { recursive: true })
    await fs.writeFile(path.join(workspace, 'package.json'), JSON.stringify({ private: true, packageManager: 'pnpm@12.15.0', dependencies: { webpack: modern, 'webpack-cli': cli, 'webpack-dev-server': server } }))
    await fs.writeFile(path.join(workspace, 'target', 'package.json'), JSON.stringify({ name: 'target', version: '1.0.0', dependencies: { webpack: compiler, 'webpack-dev-server': legacyServer, 'fixture-runner': runner } }))
    if (legacyContext) {
      await fs.mkdir(path.join(workspace, 'legacy'))
      await fs.writeFile(path.join(workspace, 'legacy', 'package.json'), JSON.stringify({ name: 'legacy', version: '1.0.0', dependencies: { webpack: modern, 'webpack-cli': cli, 'webpack-dev-server': legacyServer } }))
    }
    const config = { packages: legacyContext ? ['target', 'legacy'] : ['target'] }
    const install = args => runOwned('pnpm', ['install', '--ignore-scripts', ...args], { cwd: workspace, env: { ...process.env, CI: '1' }, stdio: 'pipe', timeoutMs: 20000 })
    await fs.writeFile(path.join(workspace, 'pnpm-workspace.yaml'), stringify(config))
    await install([])
    const originalBytes = await fs.readFile(path.join(workspace, 'pnpm-lock.yaml'))
    const parse = bytes => parseAllDocuments(bytes.toString()).map(doc => doc.toJS()).find(lock => lock.importers?.target)
    const original = parse(originalBytes)
    const compilerId = Object.entries(original.packages).find(([key, value]) => key.startsWith('webpack@') && value.version === '5.91.0')[0]
    const serverId = Object.entries(original.packages).find(([key, value]) => key.startsWith('webpack-dev-server@') && value.version === '4.15.2')[0]
    const consumers = [compilerId, serverId]
    const originalCompiler = Object.entries(original.snapshots).find(([key]) => key.split('(')[0] === compilerId)[1]
    assert.ok(originalCompiler.optionalDependencies?.['webpack-cli'], '真实 fixture 必须先有待隔离 CLI 边')
    config.overrides = optionalCliOverrides
    await fs.writeFile(path.join(workspace, 'pnpm-workspace.yaml'), stringify(config))
    await install(['--no-frozen-lockfile'])
    const isolatedBytes = await fs.readFile(path.join(workspace, 'pnpm-lock.yaml'))
    const isolated = parse(isolatedBytes)
    auditOptionalCliIsolation(original, isolated, consumers)
    await install(['--frozen-lockfile'])
    assert.equal(sha256(await fs.readFile(path.join(workspace, 'pnpm-lock.yaml'))), sha256(isolatedBytes))
    for (const mutate of [
      lock => { Object.values(lock.packages).find(value => value.version === '7.2.3').peerDependencies.webpack = '5.105.4' },
      lock => { Object.entries(lock.snapshots).find(([key]) => key.startsWith('webpack-cli@'))[1].optional = true },
      lock => { lock.importers.target.dependencies.webpack.specifier = 'other' },
      lock => { Object.entries(lock.snapshots).find(([key]) => key.startsWith('webpack-cli@'))[1].dependencies.webpack = original.importers.target.dependencies.webpack.version },
      lock => { Object.entries(lock.snapshots).find(([key]) => key.startsWith('webpack-cli@') && key.includes('5.2.7'))[1].optionalDependencies['webpack-dev-server'] = original.importers.target.dependencies['webpack-dev-server'].version },
    ]) {
      const changed = structuredClone(isolated)
      mutate(changed)
      assert.throws(() => auditOptionalCliIsolation(original, changed, consumers))
    }
  }
  finally { assertProcessesStopped(); await fs.rm(temporary, { recursive: true, force: true }) }
}

test('真实 pnpm 精确移除仅改编译器与旧 dev-server 的可选 peer；重复 frozen 安装保持锁和现代 CLI 图', { timeout: 60000 }, () => fixture())
test('真实 pnpm 双向 peer 环仅允许准确 WDS4 的 CLI group 传播，拒绝 WDS5 或实际 Webpack 改绑', { timeout: 60000 }, () => fixture(true))
