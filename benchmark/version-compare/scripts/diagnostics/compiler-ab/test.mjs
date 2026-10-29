import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { observerIdentity, readPackage, sha256 } from './identity.mjs'
import { packageFiles } from './installed-graph.mjs'
import { outputManifest, sampleRss, validatePhases } from './measure.mjs'
import { assertTemporaryRoot, previousProjectManifest, previousWorkspace } from './prepare.mjs'
import { runOrder } from './run.mjs'
import { createRuntimeGuardSession, readRuntimeGuardEvidence } from './runtime-guard.mjs'
import { assertProcessesStopped, groupStatus, pollGroup, processOwnership, runOwned, stopGroup } from './owned-process.mjs'
import './lock-axis.test.mjs'
import './gc-evidence.test.mjs'
import './optional-cli.test.mjs'
import './lock-roots.test.mjs'
import './optional-esbuild.test.mjs'
import './runtime-guard.test.mjs'
import './tool-metadata.test.mjs'
import './compiler-context.test.mjs'
import './platform.test.mjs'

const execute = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))
const { assetEvidence } = createRequire(import.meta.url)('./preload.cjs')

test('RSS 探针只领取剩余构建预算，过期不调度且失败不吞掉', () => {
  let calls = 0
  const execute = (_command, _args, options) => {
    calls += 1
    assert.equal(options.timeout, 40)
    return { status: 0, stdout: '100 1 1024 node\n200 100 2048 child\n', stderr: '' }
  }
  assert.equal(sampleRss(100, 100, execute, () => 60).rssMb, 3)
  assert.throws(() => sampleRss(100, 60, execute, () => 60), /禁止新建探针/)
  assert.equal(calls, 1)
  const failure = new Error('ps timeout')
  assert.throws(() => sampleRss(100, 100, () => ({ error: failure }), () => 60), error => error === failure)
})

test('只有临时副本可写；变更策略保留其它 overrides、catalog 和补丁', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler-ab-guard-'))
  try {
    const source = path.join(temporary, 'source')
    const copy = path.join(temporary, 'copy')
    await fs.mkdir(source)
    await fs.mkdir(copy)
    await assert.rejects(assertTemporaryRoot(source, source), /源工作树/)
    await assertTemporaryRoot(copy, source)
    await fs.writeFile(path.join(copy, '.git'), 'gitdir: fixture')
    await assert.rejects(assertTemporaryRoot(copy, source), /Git 元数据/)
    const value = { overrides: { existing: '1.0.0' }, patchedDependencies: { 'webpack@5.91.0': 'current.patch', other: 'other.patch' }, catalogs: { original: true } }
    const doc = {
      setIn([field, key], item) { value[field] ??= {}; value[field][key] = item },
      deleteIn([field, key]) { delete value[field][key] },
    }
    previousWorkspace(doc, { 'webpack-sources': '3.5.1' }, 'previous.patch')
    assert.deepEqual(value, {
      overrides: { existing: '1.0.0', '@tarojs/webpack5-runner@4.3.1>webpack': '5.105.4', '@tarojs/taro-loader@4.3.1>webpack': '5.105.4', '@tarojs/webpack5-prebundle@4.3.1>webpack': '5.105.4', 'webpack@5.105.4>webpack-sources': '3.5.1' },
      patchedDependencies: { 'webpack@5.91.0': 'current.patch', other: 'other.patch', 'webpack@5.105.4': 'previous.patch' },
      catalogs: { original: true },
    })
    const manifest = { dependencies: { other: 'catalog:tools' }, devDependencies: { webpack: '5.91.0', taro: '4.3.1' } }
    assert.deepEqual(previousProjectManifest(manifest), { ...manifest, devDependencies: { webpack: '5.105.4', taro: '4.3.1' } })
    assert.equal(manifest.devDependencies.webpack, '5.91.0')
    assert.throws(() => previousProjectManifest({ devDependencies: { webpack: 'catalog:webpack' } }), /准确 Webpack/)
  }
  finally { await fs.rm(temporary, { recursive: true, force: true }) }
})

test('逐资产完整 hash 不调用 source.map，输出 manifest 保留带空格目录与二进制身份', async () => {
  const source = { source: () => Buffer.from([0, 255]), size: () => 2, map: () => { throw new Error('不允许物化 map') } }
  const evidence = assetEvidence({ getAssets: () => [{ name: 'a.js', source, info: { related: { sourceMap: 'a.js.map' } } }], modules: new Set([1]), chunks: new Set([1]) })
  assert.equal(evidence.manifest[0].sha256, sha256(Buffer.from([0, 255])))
  assert.equal(evidence.mapAssetCount, 0)
  assert.equal(evidence.relatedSourceMapCount, 1)
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler-ab-output-'))
  try {
    await fs.mkdir(path.join(temporary, 'nested dir'))
    await fs.writeFile(path.join(temporary, 'nested dir', 'asset.bin'), Buffer.from([0, 255]))
    assert.deepEqual(await outputManifest(temporary), [{ name: path.join('nested dir', 'asset.bin'), bytes: 2, sha256: sha256(Buffer.from([0, 255])) }])
  }
  finally { await fs.rm(temporary, { recursive: true, force: true }) }
})

test('真实 Node 加载守卫与 preload 观测兼容，ESM Worker 的空环境/execArgv 仍保留证据', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler-ab-node-'))
  try {
    const library = path.join(temporary, 'node_modules', 'webpack', 'lib')
    await fs.mkdir(library, { recursive: true })
    await fs.writeFile(path.join(temporary, 'package.json'), '{}')
    await fs.writeFile(path.join(library, '..', 'package.json'), '{"name":"webpack","version":"fixture"}')
    await fs.writeFile(path.join(library, 'Compilation.js'), 'module.exports = { PROCESS_ASSETS_STAGE_OPTIMIZE_SIZE: 400 }')
    await fs.writeFile(path.join(library, 'Compiler.js'), `
      class Hook { constructor() { this.taps = [] } tap(options, fn) { this.taps.push({ stage: options.stage || 0, fn }) } call() { for (const tap of this.taps.sort((a,b) => a.stage-b.stage)) tap.fn() } }
      class TerserPlugin { constructor() { this.options = { parallel: true } } }
      class CssMinimizerPlugin { constructor() { this.options = { parallel: true } } }
      module.exports = class Compiler {
        constructor() { this.options = { mode: 'production', cache: false, resolve: { mainFields: ['main:mini', 'module', 'main'] }, optimization: { minimize: true, minimizer: [new TerserPlugin(), new CssMinimizerPlugin()] } } }
        newCompilation() {
          let value = 'before';
          const source = { source: () => value, size: () => Buffer.byteLength(value), map: () => { throw new Error('source.map called') } };
          const hooks = { processAssets: new Hook(), afterProcessAssets: new Hook() };
          hooks.processAssets.tap({ stage: 400 }, () => { value = 'after' });
          return { original: true, hooks, modules: new Set([1, 2]), chunks: new Set([1]), getAssets: () => [{ name: 'app.js', source, info: {} }] };
        }
      };
    `)
    const entry = path.join(temporary, 'entry.cjs')
    await fs.writeFile(entry, `
      const assert = require('node:assert/strict');
      const Compiler = require('./node_modules/webpack/lib/Compiler.js');
      const compilation = new Compiler().newCompilation();
      assert.equal(compilation.original, true);
      compilation.hooks.processAssets.call();
      compilation.hooks.afterProcessAssets.call();
      process.stdout.write(JSON.stringify({ pid: process.pid }));
      import('node:worker_threads').then(({ Worker }) => {
        const worker = new Worker('require("node:worker_threads").parentPort.postMessage("ok")', { eval: true, execArgv: [], env: {} });
        worker.once('message', message => assert.equal(message, 'ok'));
      }).catch(error => { console.error(error); process.exitCode = 1 });
    `)
    const file = path.join(temporary, 'compiler.ndjson')
    const runnerRoot = path.join(temporary, 'node_modules', '@tarojs', 'webpack5-runner')
    await fs.mkdir(path.join(runnerRoot, 'dist'), { recursive: true })
    await fs.writeFile(path.join(runnerRoot, 'package.json'), '{"name":"@tarojs/webpack5-runner","version":"fixture"}')
    await fs.writeFile(path.join(runnerRoot, 'dist', 'index.mini.js'), '// fixture')
    const actual = readPackage(temporary, 'webpack')
    const contexts = [{ ...actual, key: 'webpack@fixture', files: packageFiles(actual.directory) }]
    const compiler = observerIdentity({ webpack: actual, runner: readPackage(temporary, '@tarojs/webpack5-runner'), compilerContexts: contexts, runnerEntrySha256: sha256('// fixture') })
    const guard = createRuntimeGuardSession(path.join(temporary, 'guard'), { webpackSources: contexts })
    const { stdout } = await execute(process.execPath, [...guard.execArgv, '--require', path.join(here, 'preload.cjs'), entry], {
      env: { ...process.env, ...guard.env, WEAPP_TW_COMPILER_AB_SESSION: JSON.stringify({ root: temporary, project: temporary, expectedEntry: entry, file, compiler }) }, timeout: 10000,
    })
    readRuntimeGuardEvidence(guard.session, { rootPid: JSON.parse(stdout).pid })
    const records = (await fs.readFile(file, 'utf8')).trim().split('\n').map(JSON.parse)
    validatePhases(records, compiler)
    const phases = records.filter(item => item.type === 'phase')
    assert.deepEqual(phases.map(item => item.manifest[0].sha256), ['before', 'after', 'after'].map(sha256))
    assert.equal(records.at(-1).workers.created, 1)
    assert.equal(records.at(-1).workers.peak, 1)
    assert.equal(records.at(-1).workers.active, 0)
    assert.throws(() => validatePhases(records.slice(0, -1), compiler), /退出观测/)
    assert.throws(() => validatePhases(records.filter(item => item.phase !== 'after-optimize-size'), compiler))
    assert.equal(records.filter(item => item.type === 'compiler-options')[0].options.resolve.mainFields[0], 'main:mini')
  }
  finally { await fs.rm(temporary, { recursive: true, force: true }) }
})

test('诊断固定每侧三次完整冷构建，workflow 与正式 check 隔离', async () => {
  assert.deepEqual(runOrder.filter(([role]) => role === 'current').map(([, round]) => round), [1, 2, 3])
  assert.deepEqual(runOrder.filter(([role]) => role === 'previous').map(([, round]) => round), [1, 2, 3])
  const workflow = await fs.readFile(path.resolve(here, '../../../../..', '.github/workflows/taro-webpack-compiler-diagnostic.yml'), 'utf8')
  assert.match(workflow, /workflow_dispatch:/)
  assert.doesNotMatch(workflow, /pull_request:|push:|workflow_call:/)
  assert.match(workflow, /node-version: 22\.23\.4/)
  assert.match(workflow, /name: Diagnostic \/ Taro compiler and optional esbuild peer/)
})

test('有界 runner 在超时后终止本轮父子进程，确认 close/reap 并保留首错', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler-ab-process-'))
  try {
    const pidFile = path.join(temporary, 'child.pid')
    const source = `
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', 'process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'], { stdio: 'inherit' });
      require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(child.pid));
      process.on('SIGTERM',()=>{});setInterval(()=>{},1000);
    `
    await assert.rejects(runOwned(process.execPath, ['-e', source], { cwd: temporary, stdio: ['ignore', 'pipe', 'pipe'], timeoutMs: 200 }), (error) => {
      assert.match(error.cause.message, /固定 200ms 截止/)
      assert.equal(error.ownership.closed, true)
      assert.equal(error.ownership.groupGone, true)
      assert.deepEqual(error.errors.slice(1).map(item => item.message), error.ownership.cleanupErrors, '已确认回收后也必须保留阶段查询错误')
      return true
    })
    assert.ok(Number(await fs.readFile(pidFile, 'utf8')) > 0)
    assertProcessesStopped()
    await assert.rejects(runOwned(process.execPath, ['-e', 'process.exit(7)'], { cwd: temporary, stdio: 'ignore', timeoutMs: 2000 }), error => /退出 7/.test(error.cause.message))
    await assert.rejects(runOwned(path.join(temporary, 'missing-executable'), [], { cwd: temporary, stdio: 'ignore', timeoutMs: 1000 }), error => error.cause.code === 'ENOENT')
    assertProcessesStopped()
    assert.ok(processOwnership().every(item => item.closed && item.groupGone))
  }
  finally { await fs.rm(temporary, { recursive: true, force: true }) }
})

test('空组和 PID 出生身份复用均不发送信号，未登记组必须保留', async () => {
  const row = (pid, ppid, birth) => ({ pid, ppid, pgid: 100, state: 'S', birth })
  const state = () => ({ pid: 100, members: { 100: 'original' }, groupGone: false, cleanupErrors: [] })
  for (const rows of [[], [row(100, 1, 'new-process')]]) {
    const owner = state()
    const signals = []
    let probes = 0
    await stopGroup(owner, { inspect() { probes += 1; return rows }, signal(...args) { signals.push(args) } })
    assert.equal(owner.groupGone, true)
    assert.equal(probes, 1)
    assert.deepEqual(signals, [])
  }
  const owner = state()
  assert.equal(groupStatus(owner, [row(100, 1, 'original'), row(200, 100, 'owned-child')]).safeToSignal, true)
  assert.equal(owner.members[200], 'owned-child')
  const inconsistent = groupStatus(owner, [row(100, 1, 'reused'), row(200, 1, 'owned-child')])
  assert.equal(inconsistent.safeToSignal, false)
  assert.equal(inconsistent.gone, false)
  const unknown = state()
  const signals = []
  await stopGroup(unknown, { inspect: () => [row(300, 1, 'unknown')], signal(...args) { signals.push(args) } })
  assert.equal(unknown.groupGone, false)
  assert.ok(unknown.cleanupErrors.some(error => error.includes('保留副本')))
  assert.deepEqual(signals, [])
})

test('绝对截止耗尽后不再创建探针，也不发送未及时核对身份的信号', async () => {
  const owner = { pid: 100, members: { 100: 'original' }, groupGone: false, cleanupErrors: [] }
  const rows = [{ pid: 100, ppid: 1, pgid: 100, state: 'S', birth: 'original' }]
  let clock = 0
  let probes = 0
  let sleeps = 0
  const deps = { now: () => clock, inspect() { probes += 1; return rows }, sleep() { sleeps += 1; clock += 25 } }
  assert.equal((await pollGroup(owner, 0, deps)).deadlineExhausted, true)
  assert.equal(probes, 0)
  await assert.rejects(pollGroup(owner, 100, { ...deps, inspect() { probes += 1; clock = 100; return rows } }), /耗尽阶段截止/)
  assert.equal(probes, 1)
  assert.equal(sleeps, 0)
  const signals = []
  probes = 0
  await stopGroup(owner, { ...deps, inspect(_pid, deadline) { probes += 1; clock = deadline; return rows }, signal(...args) { signals.push(args) } })
  assert.equal(probes, 2)
  assert.deepEqual(signals, [])
  assert.equal(owner.groupGone, false)
})

test('TERM 查询失败后独立确认组消失，仍保留原始清理错误', async () => {
  const owner = { pid: 100, members: { 100: 'original' }, groupGone: false, cleanupErrors: [] }
  const rows = [{ pid: 100, ppid: 1, pgid: 100, state: 'S', birth: 'original' }]
  const failure = new Error('fixture ps ETIMEDOUT')
  let probes = 0
  const signals = []
  await stopGroup(owner, {
    now: () => 0,
    inspect() { probes += 1; if (probes === 2) throw failure; return probes === 1 ? rows : [] },
    signal(_state, _status, name) { signals.push(name) },
  })
  assert.equal(owner.groupGone, true)
  assert.equal(probes, 3)
  assert.deepEqual(signals, ['SIGTERM'])
  assert.deepEqual(owner.cleanupErrors, [failure.stack])
})
