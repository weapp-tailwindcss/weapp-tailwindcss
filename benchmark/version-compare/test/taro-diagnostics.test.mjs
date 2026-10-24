import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, expect, it } from 'vitest'
import { diagnosticSymbol, validateAllocationRequest } from '../scripts/diagnostics/constants.mjs'
import { createCaseDiagnostics } from '../scripts/diagnostics/controller.mjs'
import { createGcDiagnostics } from '../scripts/gc-diagnostics.mjs'
import { createServiceFixture, mpxProject, versionFor } from './helpers/gc-service.mjs'
import { viteOperationFixture } from './helpers/vite-operations.mjs'

const roots = []
const project = { ...mpxProject, key: 'demo-taro-vite-react-tailwindcss-v4__mp-weixin', sourceFile: 'source.tsx' }
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function fixture(source = '') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'taro-diagnostic-'))
  roots.push(root)
  const service = await createServiceFixture(root, '', 'taro.mjs', { packageName: '@tarojs/cli', binName: 'taro' })
  const entry = path.join(root, 'scripts', 'taro-build-runner.mjs')
  await fs.mkdir(path.dirname(entry))
  await fs.writeFile(entry, `process.argv[1] = ${JSON.stringify(service.entry)};\n${source}`)
  await fs.writeFile(path.join(service.cwd, project.sourceFile), 'flex 中文')
  return { root, cwd: service.cwd, entry, bin: service.entry }
}

it('仅显式登记的单个 Taro Vite 诊断接受固定工作负载，不扩展其他框架', () => {
  const request = { enabled: true, guardMode: false, baselineRef: 'a'.repeat(40), selectedProjects: [project], buildRuns: 3, hmrRuns: 3 }
  expect(() => validateAllocationRequest(request)).not.toThrow()
  expect(() => validateAllocationRequest({ ...request, guardMode: true })).toThrow('正式')
  expect(() => validateAllocationRequest({ ...request, buildRuns: 0 })).toThrow('固定')
  expect(() => validateAllocationRequest({ ...request, selectedProjects: [project, project] })).toThrow('固定')
})

it('Taro 诊断绑定仓库 Node runner 并验证 CLI 包身份，缺失 runner 不伪装为 CLI 证据', async () => {
  const { root, cwd, entry, bin } = await fixture()
  const args = { cwd, versionMeta: versionFor(root), projectMeta: project, directory: path.join(root, 'evidence'), kind: 'hmr', run: 1 }
  const diagnostics = await createGcDiagnostics(args)
  expect(diagnostics.env.WEAPP_TW_BENCH_GC_EXPECTED_ENTRY).toBe(await fs.realpath(entry))
  expect(diagnostics.env.WEAPP_TW_BENCH_GC_EXPECTED_ENTRY).not.toBe(await fs.realpath(bin))
  await diagnostics.finish()
  await fs.rm(entry)
  const missing = await createGcDiagnostics(args)
  expect(missing.env).toEqual({})
  await missing.finish()
  await fs.writeFile(entry, '')
  await fs.writeFile(path.join(cwd, 'node_modules', '@tarojs/cli', 'package.json'), '{"name":"other","bin":{"taro":"bin/taro.mjs"}}')
  const invalid = await createGcDiagnostics(args)
  expect(invalid.env).toEqual({})
  await invalid.finish()
  const controllers = await Promise.all((await fs.readdir(args.directory)).map(async directory => JSON.parse(await fs.readFile(path.join(args.directory, directory, 'controller.json'), 'utf8'))))
  expect(controllers.some(controller => controller.setupError?.includes('身份或 bin 不匹配'))).toBe(true)
})

it.each(['inputs', 'allocation'])('真实 Taro runner 改写 argv 后仍保留 %s worker 的来源和采样证据', async (mode) => {
  const { root, cwd, entry } = await fixture(`
const observer = globalThis[Symbol.for(${JSON.stringify(diagnosticSymbol)})];
if (!observer) throw new Error('runner preload absent');
if (${JSON.stringify(mode)} === 'inputs' && process.moduleLoadList.includes('NativeModule inspector')) throw new Error('unexpected inspector');
const store = { snapshot: () => ({ candidatesById: [['source.tsx', ['flex']]], sourceById: [['source.tsx', 'flex 中文']] }), values: () => new Set(['flex']), getRevision: () => 1 };
observer.registerStore(store);
${viteOperationFixture()}
await diagnosticGenerate();
const allocation = Array.from({length: 20000}, (_, i) => ({ values: new Array(32).fill(i) }));
await observer.compilation({ sourceCandidates: store.values() });
if (allocation.length !== 20000) throw new Error('fixture');
`)
  const diagnostics = await createCaseDiagnostics({ allocation: mode, cwd, versionMeta: versionFor(root), projectMeta: project, directory: path.join(root, 'evidence'), kind: 'build', run: 1 })
  const child = spawn(process.execPath, [entry], { env: { ...process.env, ...diagnostics.env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', chunk => output += chunk)
  child.stderr.on('data', chunk => output += chunk)
  let timer
  try {
    const code = await new Promise((resolve, reject) => {
      timer = setTimeout(() => {
        child.kill()
        reject(new Error(`worker timeout: ${output}`))
      }, 10000)
      child.once('error', reject)
      child.once('close', resolve)
    })
    expect(code, output).toBe(0)
    await diagnostics.finish()
    const directory = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_ALLOCATION_SESSION).sessionDirectory
    const start = JSON.parse(await fs.readFile(path.join(directory, 'process-start.json'), 'utf8'))
    expect(start).toMatchObject({ nodeVersion: process.version, executable: await fs.realpath(process.execPath) })
    expect(start.actualEntry).toBe(await fs.realpath(entry))
    expect(start.identity.project).toBe(project.key)
    const gc = JSON.parse(await fs.readFile(path.join(directory, 'controller.json'), 'utf8'))
    expect(gc).toMatchObject({ missingPreloadEvidence: false, processEvidence: [{ ready: true }] })
    const inputs = JSON.parse(await fs.readFile(path.join(directory, 'inputs-1.json'), 'utf8'))
    expect(inputs.compilationCandidates.sourceCandidates).toEqual(['flex'])
    expect((await fs.readdir(directory)).includes('allocation-1.json')).toBe(mode === 'allocation')
  }
  finally {
    clearTimeout(timer)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
      await new Promise(resolve => child.once('close', resolve))
    }
  }
}, 15000)
