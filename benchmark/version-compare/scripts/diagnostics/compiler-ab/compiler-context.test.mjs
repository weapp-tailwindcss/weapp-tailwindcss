import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { compilerFixture } from './compiler-context-fixture.mjs'
import { installedLockGraph, platformMatches, sameCompilerSources } from './installed-graph.mjs'
import { validateCompilerGuard, validatePhases } from './measure.mjs'
import { createRuntimeGuardSession, readRuntimeGuardEvidence } from './runtime-guard.mjs'

const execute = promisify(execFile)
const preload = path.join(path.dirname(fileURLToPath(import.meta.url)), 'preload.cjs')

async function fixture(action) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'compiler two contexts '))
  try { return await action(root, await compilerFixture(root)) }
  finally { await fs.rm(root, { recursive: true, force: true }) }
}

async function launch(root, fixture, source, suffix = 'run', override) {
  const entry = await fixture.file([`${suffix}.cjs`], source)
  const file = path.join(root, `${suffix}.ndjson`)
  const guard = createRuntimeGuardSession(path.join(root, `${suffix}-guard`), { webpackSources: fixture.contexts })
  const compiler = override ?? fixture.binding
  const result = await execute(process.execPath, [...guard.execArgv, '--require', preload, entry], {
    timeout: 10000, env: { ...process.env, ...guard.env, WEAPP_TW_COMPILER_AB_SESSION: JSON.stringify({ root, project: root, expectedEntry: entry, file, compiler, role: 'current', run: 1, sourceIdentity: { ref: 'a'.repeat(40), archiveSha256: 'b'.repeat(64) } }) },
  })
  const evidence = readRuntimeGuardEvidence(guard.session, { rootPid: JSON.parse(result.stdout).pid })
  const records = (await fs.readFile(file, 'utf8')).trimEnd().split('\n').map(JSON.parse)
  return { records, evidence }
}

const compile = `
  const assert = require('node:assert/strict');
  const Compiler = require('@tarojs/webpack5-runner');
  assert.equal(Compiler, require('@tarojs/webpack5-runner'));
  const compiler = new Compiler(); const token = {}; compiler.token = token;
  const compilation = compiler.newCompilation(token);
  assert.equal(compilation.original, token);
  compilation.hooks.processAssets.call(); compilation.hooks.afterProcessAssets.call();
  process.stdout.write(JSON.stringify({ pid: process.pid }));
`

test('准确锁图允许两个同源码 peer 上下文，错误 peer/版本和意外合并都拒绝', async () => fixture(async (_root, value) => {
  const graph = installedLockGraph(value.lock, value.seeds)
  assert.equal(Object.keys(graph.bindings).length, 4)
  sameCompilerSources(value.contexts)
  const wrongPeer = structuredClone(value.lock)
  wrongPeer.snapshots[value.contexts[1].key].dependencies['compiler-peer'] = '1.0.0'
  assert.throws(() => installedLockGraph(wrongPeer, value.seeds), /安装版本与批准锁边不符/)
  const merged = value.seeds.map(seed => ({ ...seed, reference: value.contexts[0].key }))
  assert.throws(() => installedLockGraph(value.lock, merged), /同一锁上下文解析到不同目录/)
  const wrongVersion = structuredClone(value.lock)
  wrongVersion.snapshots['webpack@5.105.4'] = wrongVersion.snapshots[value.contexts[1].key]
  wrongVersion.packages['webpack@5.105.4'] = wrongVersion.packages['webpack@5.91.0']
  assert.throws(() => installedLockGraph(wrongVersion, [{ ...value.seeds[1], reference: 'webpack@5.105.4' }]), /安装版本与批准锁边不符/)
}))

test('可选缺席只按锁内 OS/CPU/libc 约束，支持的平台缺包仍失败', async () => fixture(async (_root, value) => {
  for (const field of ['os', 'cpu']) {
    const lock = structuredClone(value.lock)
    const id = 'missing-optional@1.0.0'
    lock.packages[id] = { resolution: { integrity: 'fixture:optional' }, [field]: [`!${field === 'os' ? process.platform : process.arch}`] }
    lock.snapshots[id] = {}
    lock.snapshots[value.contexts[1].key].optionalDependencies = { 'missing-optional': '1.0.0' }
    const graph = installedLockGraph(lock, value.seeds)
    assert.ok(graph.edges.some(edge => edge.key === id && edge.unavailablePlatform))
    delete lock.packages[id][field]
    assert.throws(() => installedLockGraph(lock, value.seeds), /Cannot find module/)
  }
  assert.equal(platformMatches(['glibc'], 'musl'), false)
  assert.equal(platformMatches(['!musl'], 'glibc'), true)
  assert.equal(platformMatches(['any'], 'glibc'), true)
}))

test('同版本的错误补丁、JSON 或隐藏源码差异不获得源码相等授权', async () => fixture(async (_root, value) => {
  const file = path.join(value.contexts[0].directory, 'lib', 'Compiler.js')
  const original = await fs.readFile(file)
  await fs.appendFile(file, '\n// different patch\n')
  assert.throws(() => sameCompilerSources(value.contexts), /完整源码或补丁内容不一致/)
  await fs.writeFile(file, original)
  await fs.writeFile(path.join(value.contexts[0].directory, '.hidden.json'), '{}')
  assert.throws(() => sameCompilerSources(value.contexts), /完整源码或补丁内容不一致/)
}))

test('真实 Node 观察 runner 类，合法 direct 加载保留导出、this、结果及原始异常', async () => fixture(async (root, value) => {
  const source = `
    const Direct = require('webpack/lib/Compiler.js'); const direct = new Direct(); direct.token = 1;
    require('node:assert/strict').throws(() => direct.newCompilation(1), /original direct compiler exception/);
    ${compile}
  `
  const { records, evidence } = await launch(root, value, source)
  validatePhases(records, value.binding)
  assert.equal(records.at(-1).compilations, 1)
  const phases = records.filter(record => record.type === 'phase')
  assert.equal(phases.length, 3)
  assert.ok(evidence.compilerLoads.some(item => item.root === value.contexts[0].directory))
  assert.ok(evidence.compilerLoads.some(item => item.root === value.contexts[1].directory && item.filename === path.join(value.contexts[1].directory, 'lib', 'Compiler.js')))
  validateCompilerGuard(evidence, value.binding, records[0].pid)
  assert.throws(() => validateCompilerGuard({ ...evidence, compilerLoads: [] }, value.binding, records[0].pid), /缺少真实 runner/)
  assert.throws(() => validateCompilerGuard(evidence, value.binding, records[0].pid + 1), /缺少真实 runner/)
  assert.throws(() => validatePhases(records), /缺少批准/)
  const wrong = structuredClone(value.binding)
  wrong.target = wrong.contexts[0]
  assert.throws(() => validatePhases(records, wrong), /观测启动身份不符/)
  assert.throws(() => validatePhases(records.filter(record => record.type !== 'compiler-options'), value.binding), /没有真实主编译器/)
  const corrupt = structuredClone(records)
  corrupt.find(record => record.type === 'phase').compiler = value.binding.contexts[0]
  assert.throws(() => validatePhases(corrupt, value.binding), /阶段与实际编译器身份不符/)
  for (const kind of ['root', 'source', 'peer']) {
    const bad = structuredClone(value.binding)
    if (kind === 'root') bad.target = bad.contexts[0]
    if (kind === 'source') bad.contexts[1].compilerSha256 = '0'.repeat(64)
    if (kind === 'peer') bad.runner.directory = value.contexts[0].directory
    await assert.rejects(launch(root, value, compile, kind, bad), /批准|身份|上下文/)
  }
}))

test('额外已批准 context 真实创建编译器仍失败，不能只观察其中一个', async () => fixture(async (root, value) => {
  const source = `
    const Direct = require('webpack/lib/Compiler.js'); const direct = new Direct(); direct.token = 'allowed-direct';
    const extra = direct.newCompilation('allowed-direct'); extra.hooks.processAssets.call(); extra.hooks.afterProcessAssets.call();
    ${compile}
  `
  const { records } = await launch(root, value, source)
  assert.equal(records.at(-1).compilations, 2)
  assert.throws(() => validatePhases(records, value.binding), /runner 以外/)
}))

test('相同 runner 类仅接入一次，主/子编译各保留三阶段；worker Compiler 缺观测则拒绝', async () => fixture(async (root, value) => {
  const child = `
    ${compile}
    const Child = require('@tarojs/webpack5-runner'); const child = new Child(); child.token = 2; child.parentCompilation = {};
    const nested = child.newCompilation(2); nested.hooks.processAssets.call(); nested.hooks.afterProcessAssets.call();
  `
  const { records } = await launch(root, value, child, 'child-compiler')
  validatePhases(records, value.binding)
  assert.equal(records.at(-1).compilations, 2)
  assert.equal(records.filter(item => item.type === 'phase').length, 6)
  const worker = `
    ${compile}
    new (require('node:worker_threads').Worker)(${JSON.stringify(`require(${JSON.stringify(path.join(value.contexts[1].directory, 'lib', 'Compiler.js'))})`)}, {eval:true,env:{},execArgv:[]});
  `
  const result = await launch(root, value, worker, 'worker-compiler')
  validatePhases(result.records, value.binding)
  assert.throws(() => validateCompilerGuard(result.evidence, value.binding, result.records[0].pid), /未观测 isolate/)
}))

test('守卫拒绝相同版本异补丁和不同版本的额外 compiler，catch 不能撤销记录', async () => fixture(async (root, value) => {
  for (const [index, version] of ['5.91.0', '5.105.4'].entries()) {
    const alternate = await value.file([`alternate-${index}`, 'package.json'], JSON.stringify({ name: 'webpack', version }))
    const entry = await value.file([`alternate-${index}`, 'Compiler.cjs'], 'module.exports = class Compiler {}')
    await assert.rejects(launch(root, value, `try { require(${JSON.stringify(entry)}) } catch {} process.stdout.write(JSON.stringify({pid:process.pid}));`, `alternate-${index}`), /unapproved webpack compiler context/)
    assert.ok(alternate)
  }
  await fs.appendFile(path.join(value.contexts[1].directory, 'lib', 'Compiler.js'), '\n// wrong patch')
  await assert.rejects(launch(root, value, compile, 'changed-source'), /源码与批准身份不符/)
}))

test('完整源码合同独立保护 main/child/worker，业务吞掉异补丁加载仍拒绝', async () => fixture(async (root, value) => {
  const filename = path.join(value.contexts[1].directory, 'lib', 'Compiler.js')
  await fs.appendFile(filename, '\n// changed after approved frozen installation\n')
  const consume = `try { require(${JSON.stringify(filename)}) } catch {}`
  const sources = {
    main: `${consume}; process.stdout.write(JSON.stringify({pid:process.pid}));`,
    child: `require('node:child_process').spawnSync(process.execPath,['-e',${JSON.stringify(consume)}],{env:{},stdio:'inherit'}); process.stdout.write(JSON.stringify({pid:process.pid}));`,
    worker: `new (require('node:worker_threads').Worker)(${JSON.stringify(consume)},{eval:true,env:{},execArgv:[]}).once('exit',()=>process.stdout.write(JSON.stringify({pid:process.pid})));`,
  }
  for (const [kind, source] of Object.entries(sources)) {
    const entry = await value.file([`guard-${kind}.cjs`], source)
    const guard = createRuntimeGuardSession(path.join(root, `source-${kind}-guard`), { webpackSources: value.contexts })
    const result = await execute(process.execPath, [...guard.execArgv, entry], { timeout: 10000, env: { ...process.env, ...guard.env } })
    assert.throws(() => readRuntimeGuardEvidence(guard.session, { rootPid: JSON.parse(result.stdout).pid }), /webpack compiler source hash mismatch/)
  }
}))
