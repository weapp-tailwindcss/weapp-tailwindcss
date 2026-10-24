import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { createCaseDiagnostics } from '../scripts/diagnostics/controller.mjs'
import { sha256 } from '../scripts/diagnostics/evidence.mjs'
import { createServiceFixture, createUniServiceFixture, uniProject, versionFor } from './helpers/gc-service.mjs'
import { viteOperationFixture } from './helpers/vite-operations.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

function nextMessage(child, expected) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`watch fixture 未返回 ${expected}`)), 10000)
    function finish(error) {
      clearTimeout(timer)
      child.off('message', onMessage)
      child.off('exit', onExit)
      if (error) {
        reject(error)
      }
      else {
        resolve()
      }
    }
    function onMessage(value) {
      if (value === expected) {
        finish()
      }
    }
    function onExit(code) {
      finish(new Error(`watch fixture 提前退出：${code}`))
    }
    child.on('message', onMessage)
    child.once('exit', onExit)
  })
}

describe('实际 watch worker 的诊断阶段与关闭', () => {
  it.each([['inputs', 'uni'], ['allocation', 'uni'], ['inputs', 'taro']])('%s %s 完整采集三次修改/回滚，关闭幂等且最后采样不冒充编译', async (mode, framework) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allocation-watch-'))
    roots.push(root)
    const source = `import fs from 'node:fs'; import path from 'node:path';
const key = path.resolve(${JSON.stringify(uniProject.sourceFile)});
const observer = globalThis[Symbol.for(${JSON.stringify(diagnosticSymbol)})];
let revision = 0;
const read = () => fs.readFileSync(key, 'utf8');
const candidates = () => new Set(read().includes('twbenchdiagnosticround') ? ['flex', 'bg-[#123456]'] : ['flex']);
const store = { snapshot: () => ({ candidatesById: [[key, [...candidates()]]], sourceById: [[key, read()]], inlineIncludedCandidates: [], inlineExcludedCandidates: [] }), values: candidates, getRevision: () => revision };
observer.registerStore(store);
${viteOperationFixture()}
async function compile() { revision++; await diagnosticGenerate(); await observer.compilation({ sourceCandidates: store.values(), runtime: store.values(), transformRuntime: store.values(), generatorRuntime: store.values() }); }
process.on('message', async (message) => {
  if (message === 'exit') { process.disconnect(); return; }
  await compile(); if (message === 'mutation-3') { await compile(); await compile(); } process.send(message);
});
await compile(); process.send('ready');
`
    const project = framework === 'uni' ? uniProject : { ...uniProject, key: 'demo-taro-vite-react-tailwindcss-v4__mp-weixin' }
    const fixture = framework === 'uni'
      ? await createUniServiceFixture(root, source)
      : await createServiceFixture(root, '', 'taro.mjs', { packageName: '@tarojs/cli', binName: 'taro' })
    const { cwd } = fixture
    let { entry } = fixture
    if (framework === 'taro') {
      const cli = entry
      entry = path.join(root, 'scripts', 'taro-build-runner.mjs')
      await fs.mkdir(path.dirname(entry), { recursive: true })
      await fs.writeFile(entry, `process.argv[1] = ${JSON.stringify(cli)};\n${source}`)
    }
    const sourcePath = path.join(cwd, uniProject.sourceFile)
    const original = '<view class="flex">原文</view>'
    await fs.writeFile(sourcePath, original)
    const diagnostics = await createCaseDiagnostics({ allocation: mode, cwd, versionMeta: versionFor(root), projectMeta: project, directory: path.join(root, 'evidence'), kind: 'hmr', run: 1 })
    const child = spawn(process.execPath, [entry], { cwd, env: { ...process.env, ...diagnostics.env }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] })
    let output = ''
    child.stdout.on('data', (value) => {
      output = `${output}${value}`.slice(-10000)
    })
    child.stderr.on('data', (value) => {
      output = `${output}${value}`.slice(-10000)
    })
    const closed = new Promise(resolve => child.once('close', resolve))
    try {
      await nextMessage(child, 'ready')
      diagnostics.mark('watch-ready')
      for (let round = 1; round <= 3; round++) {
        const marker = diagnostics.mutationMarker(round, original)
        const mutation = `${original}\n${marker}`
        for (const [stage, content] of [['mutation', mutation], ['rollback', original]]) {
          diagnostics.mark(`${stage}-write`, round)
          await fs.writeFile(sourcePath, content)
          await diagnostics.source(`${stage}-written`, sourcePath, content, marker)
          const response = nextMessage(child, `${stage}-${round}`)
          child.send(`${stage}-${round}`)
          await response
          diagnostics.mark(`${stage}-observed`, round)
        }
      }
      const closing = diagnostics.beforeStop()
      expect(diagnostics.beforeStop()).toBe(closing)
      await closing
      child.send('exit')
      expect(await closed, output).toBe(0)
      await diagnostics.finish()
      const directory = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_ALLOCATION_SESSION).sessionDirectory
      const manifest = JSON.parse(await fs.readFile(path.join(directory, 'allocation-controller.json'), 'utf8'))
      const startup = JSON.parse(await fs.readFile(path.join(directory, 'process-start.json'), 'utf8'))
      expect(startup).toMatchObject({ nodeVersion: process.version, executable: await fs.realpath(process.execPath) })
      expect(manifest.status).toMatchObject({ complete: true, compilationCount: 9, viteCompletedCount: 9, snapshotCount: 8 })
      expect(manifest.operationEvidence).toMatchObject({ viteCompleted: 9, finalizations: expect.any(Array) })
      expect(manifest.operationEvidence.finalizations).toHaveLength(7)
      expect(manifest.events.filter(event => event.type === 'watch-stop')).toHaveLength(1)
      expect(manifest.sources).toHaveLength(7)
      expect(manifest.sources.filter(event => event.type === 'rollback-written').map(event => event.sha256)).toEqual(Array.from({ length: 3 }).fill(sha256(original)))
      const last = JSON.parse(await fs.readFile(path.join(directory, 'inputs-8.json'), 'utf8'))
      expect(last.phase.type).toBe('watch-stop')
      expect(last.compilationCandidates).toBeUndefined()
      expect(last.finalizationId).toBeUndefined()
      expect(last.sources[0].candidates).toEqual(['flex'])
      expect(await fs.readFile(sourcePath, 'utf8')).toBe(original)
    }
    catch (error) {
      throw new Error(`${error.message}\n${output}`, { cause: error })
    }
    finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill()
      }
      await closed
      await fs.writeFile(sourcePath, original)
    }
  }, 30000)
})
