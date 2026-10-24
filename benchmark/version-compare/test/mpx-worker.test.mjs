import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { createCaseDiagnostics } from '../scripts/diagnostics/controller.mjs'
import { createServiceFixture, mpxProject, versionFor } from './helpers/gc-service.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

function message(child, expected) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`Mpx fixture 等待超时：${expected}`)), 10000)
    function finish(error) {
      clearTimeout(timer)
      child.off('message', onMessage)
      child.off('exit', onExit)
      error ? reject(error) : resolve()
    }
    function onMessage(value) {
      if (value === expected) {
        finish()
      }
    }
    function onExit(code) {
      finish(new Error(`Mpx fixture 提前退出：${code}`))
    }
    child.on('message', onMessage)
    child.once('exit', onExit)
  })
}

const worker = `import fs from 'node:fs'; import path from 'node:path';
const observer = globalThis[Symbol.for(${JSON.stringify(diagnosticSymbol)})];
const ops = observer.operations;
const identity = JSON.parse(process.env.WEAPP_TW_BENCH_ALLOCATION_SESSION);
const file = path.resolve('source.mpx');
const read = () => fs.readFileSync(file, 'utf8');
const candidates = () => new Set(read().includes('twbenchdiagnosticround') ? ['flex', 'bg-[#123456]'] : ['flex']);
const source = { css: '@import "tailwindcss";', base: identity.root };
const session = ops.sync('native.create', { source }, () => ({}));
ops.sync('engine.compile', { source }, () => ({}));
let service;
if (identity.capabilities.compilerServicePool.available) {
  service = { ownerId: ops.identity({}), serviceId: ops.identity({}), leaseId: ops.identity({}), generatorId: ops.identity({}), key: 'fixture', references: 1 };
  ops.sync('service.lookup', { ownerId: service.ownerId, key: service.key }, () => undefined);
  const generator = ops.sync('service.create', { ownerId: service.ownerId, source, key: service.key }, () => ({}));
  service.serviceGeneratorId = ops.identity(generator);
  ops.emit('service.acquire', service);
}
const store = { snapshot: () => ({ candidatesById: [[file, [...candidates()]]], sourceById: [[file, read()]], inlineIncludedCandidates: [], inlineExcludedCandidates: [] }), values: candidates, getRevision: () => 1 };
observer.registerStore(store);
async function compile() {
  const compilation = {};
  observer.webpackCreated(compilation);
  if (process.env.MPX_DIAGNOSTIC_CHILD_FIRST === '1') {
    const child = { compiler: { isChild: () => true } };
    observer.webpackCreated(child);
    const childCandidates = new Set(['child-only']);
    await observer.webpackCompleted(child, { sourceCandidates: childCandidates, runtime: childCandidates, transformRuntime: childCandidates, generatorRuntime: childCandidates });
  }
  const content = read();
  ops.source(file, content);
  const input = store.values();
  if (identity.capabilities.compilerServicePool.available) for (const name of ['matches.key', 'acquire.key', 'request.key', 'acquire.sourceSnapshot', 'request.snapshot', 'result.copy']) ops.sync(name, {}, () => 'fixture');
  if (service) ops.sync('service.matches', service, () => true);
  await ops.async('generator.generate', { source, options: { candidates: input } }, async () => {
    await ops.async('native.generate', { source, request: { candidates: input } }, async () => ({}));
    const css = ops.sync('engine.build', { source, candidates: input }, () => [...input].join(' '));
    return { css, rawCss: css, classSet: input };
  });
  await observer.webpackCompleted(compilation, { sourceCandidates: input, runtime: input, transformRuntime: input, generatorRuntime: input });
}
process.on('message', async value => {
  if (value === 'exit') {
    if (service) await ops.observe('service.release', service, () => Promise.resolve());
    const promise = Promise.resolve();
    if (ops.observe('native.dispose', { sessionId: ops.identity(session) }, () => promise) !== promise) throw new Error('dispose identity');
    await promise;
    process.disconnect();
    return;
  }
  await compile();
  if (value === 'mutation-3') { await compile(); await compile(); }
  process.send(value);
});
await compile(); process.send('ready');
`

describe('Mpx 诊断的真实 Node worker 协议', () => {
  it.each([[false, 'inputs', false], [true, 'inputs', false], [false, 'allocation', false], [false, 'inputs', true]])('三轮增删、额外编译与停止采样后释放保留，服务=%s 模式=%s child先完成=%s', async (servicePool, mode, childFirst) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mpx-diagnostic-worker-'))
    roots.push(root)
    if (servicePool) {
      const file = path.join(root, 'packages/weapp-tailwindcss/src/core/compiler/generator-service-pool.ts')
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, 'fixture')
    }
    const { cwd, entry } = await createServiceFixture(root, worker)
    const source = path.join(cwd, mpxProject.sourceFile)
    const original = '<view class="flex">中文</view>'
    await fs.writeFile(source, original)
    const diagnostic = await createCaseDiagnostics({ allocation: mode, cwd, versionMeta: versionFor(root), projectMeta: mpxProject, directory: path.join(root, 'evidence'), kind: 'hmr', run: 1 })
    const child = spawn(process.execPath, [entry], { cwd, env: { ...process.env, ...diagnostic.env, MPX_DIAGNOSTIC_CHILD_FIRST: childFirst ? '1' : '0' }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    let output = ''
    child.stderr.on('data', (chunk) => {
      output += chunk
    })
    const closed = new Promise(resolve => child.once('close', resolve))
    try {
      await message(child, 'ready')
      diagnostic.mark('watch-ready')
      for (let round = 1; round <= 3; round++) {
        const marker = diagnostic.mutationMarker(round, original)
        for (const [stage, text] of [['mutation', `${original}\n${marker}`], ['rollback', original]]) {
          diagnostic.mark(`${stage}-write`, round)
          await fs.writeFile(source, text)
          await diagnostic.source(`${stage}-written`, source, text, marker)
          const done = message(child, `${stage}-${round}`)
          child.send(`${stage}-${round}`)
          await done
          diagnostic.mark(`${stage}-observed`, round)
        }
      }
      await diagnostic.beforeStop()
      child.send('exit')
      expect(await closed, output).toBe(0)
      await diagnostic.finish()
      const directory = JSON.parse(diagnostic.env.WEAPP_TW_BENCH_ALLOCATION_SESSION).sessionDirectory
      const controller = JSON.parse(await fs.readFile(path.join(directory, 'allocation-controller.json'), 'utf8'))
      const compilations = childFirst ? 18 : 9
      expect(controller.operationEvidence).toMatchObject({ webpackCreated: compilations, webpackCompleted: compilations, snapshotCount: 8, capabilities: { compilerServicePool: { available: servicePool } } })
      expect(controller.status.compilationCount).toBe(compilations)
      expect(controller.operationEvidence.rootSnapshots).toHaveLength(7)
      const final = JSON.parse(await fs.readFile(path.join(directory, 'inputs-8.json'), 'utf8'))
      expect(final.compilationCandidates).toBeUndefined()
      expect(final.compilationId).toBeUndefined()
      const files = (await fs.readdir(directory)).filter(name => /^operation-\d+\.json$/.test(name))
      const events = await Promise.all(files.map(name => fs.readFile(path.join(directory, name), 'utf8').then(JSON.parse)))
      events.sort((left, right) => left.sequence - right.sequence)
      expect(events.filter(event => event.name === 'webpack.completed' && event.phase.type === 'mutation-write' && event.phase.round === 3)).toHaveLength(childFirst ? 6 : 3)
      for (const snapshot of controller.operationEvidence.rootSnapshots) {
        const inputs = JSON.parse(await fs.readFile(path.join(directory, snapshot.file), 'utf8'))
        const completion = events.find(event => event.name === 'webpack.completed' && event.details.compilationId === inputs.compilationId)
        expect(completion.details).toMatchObject({ isChild: false, selectedForSnapshot: true })
        expect(inputs.compilationCandidates.runtime).not.toContain('child-only')
      }
      if (childFirst) {
        expect(events.filter(event => event.name === 'webpack.completed' && event.details.isChild)).toHaveLength(9)
        expect(events.find(event => event.name === 'webpack.completed').details).toMatchObject({ isChild: true, selectedForSnapshot: false })
      }
      expect(events.find(event => event.name === 'native.dispose.success').phase.type).toBe('watch-stop')
      const request = events.find(event => event.name === 'generator.generate.start' && event.phase.type === 'rollback-write' && event.phase.round === 3)
      expect(request.details.options.candidates).toEqual(['flex'])
      const input = events.find(event => event.name === 'scan.source' && event.phase.type === 'watch-start')
      const blob = path.join(directory, input.details.source.text.file)
      expect(JSON.parse(await fs.readFile(blob, 'utf8')).text).toBe(original)
      const corrupted = await fs.readFile(blob)
      corrupted[0] = 91
      await fs.writeFile(blob, corrupted)
      await expect(diagnostic.finish()).rejects.toThrow('全文工件哈希不匹配')
      const startup = JSON.parse(await fs.readFile(path.join(directory, 'process-start.json'), 'utf8'))
      expect(startup.nodeVersion).toBe(process.version)
    }
    catch (error) {
      throw new Error(`${error.message}\n${output}`, { cause: error })
    }
    finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill()
      }
      await closed
      await fs.writeFile(source, original)
    }
  }, 30000)

  it('Node worker 释放拒绝后退出时保留失败，缺失编译与阶段不能验收成功', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'mpx-diagnostic-failure-'))
    roots.push(root)
    const failure = `const ops = globalThis[Symbol.for(${JSON.stringify(diagnosticSymbol)})].operations;
const result = ops.observe('native.dispose', {}, () => Promise.reject(new Error('fixture release failure')));
await result.catch(() => { process.exitCode = 7; });`
    const { cwd, entry } = await createServiceFixture(root, failure)
    await fs.writeFile(path.join(cwd, mpxProject.sourceFile), 'original')
    const diagnostic = await createCaseDiagnostics({ allocation: 'inputs', cwd, versionMeta: versionFor(root), projectMeta: mpxProject, directory: path.join(root, 'evidence'), kind: 'build', run: 1 })
    const child = spawn(process.execPath, [entry], { cwd, env: { ...process.env, ...diagnostic.env }, stdio: 'ignore' })
    const closed = new Promise(resolve => child.once('close', resolve))
    const timeout = setTimeout(() => child.kill(), 10000)
    try {
      expect(await closed).toBe(7)
      await expect(diagnostic.finish()).rejects.toThrow('不完整')
      const directory = JSON.parse(diagnostic.env.WEAPP_TW_BENCH_ALLOCATION_SESSION).sessionDirectory
      const event = JSON.parse(await fs.readFile(path.join(directory, 'operation-2.json'), 'utf8'))
      expect(event).toMatchObject({ name: 'native.dispose.failure', details: { error: 'Error: fixture release failure' } })
      const manifest = JSON.parse(await fs.readFile(path.join(directory, 'allocation-controller.json'), 'utf8'))
      expect(manifest.error).toBeTruthy()
    }
    finally {
      clearTimeout(timeout)
      if (child.exitCode === null && child.signalCode === null) {
        child.kill()
      }
      await closed
    }
  }, 15000)
})
