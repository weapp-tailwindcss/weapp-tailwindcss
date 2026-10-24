import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { afterEach, describe, expect, it } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { createCaseDiagnostics } from '../scripts/diagnostics/controller.mjs'
import { sha256 } from '../scripts/diagnostics/evidence.mjs'
import { decodeAllocationEvidence } from '../scripts/diagnostics/profile-codec.mjs'
import { createUniServiceFixture, uniProject, versionFor } from './helpers/gc-service.mjs'
import { viteOperationFixture } from './helpers/vite-operations.mjs'

const roots = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function runNode(entry, env) {
  const child = spawn(process.execPath, [entry], { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  let output = ''
  child.stdout.on('data', (chunk) => {
    output = `${output}${chunk}`.slice(-10000)
  })
  child.stderr.on('data', (chunk) => {
    output = `${output}${chunk}`.slice(-10000)
  })
  try {
    const code = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        child.kill()
        reject(new Error(`诊断 fixture 超时：${output}`))
      }, 10000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('close', (value) => {
        clearTimeout(timer)
        resolve(value)
      })
    })
    if (code !== 0) {
      throw new Error(`诊断 fixture 退出 ${code}：${output}`)
    }
  }
  finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill()
    }
  }
}

describe('实际 Node worker 的输入与分配诊断', () => {
  it.each(['inputs', 'allocation'])('%s 模式两侧同 preload，真实候选与 SHA 完整，输入模式不产生 profile', async (mode) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allocation-worker-'))
    roots.push(root)
    const controllers = []
    for (const role of ['base', 'current']) {
      const versionRoot = path.join(root, role)
      const source = `import fs from 'node:fs'; import path from 'node:path';
const identity = JSON.parse(process.env.WEAPP_TW_BENCH_ALLOCATION_SESSION);
if (identity.mode === 'inputs' && process.moduleLoadList.includes('NativeModule inspector')) throw new Error('input mode loaded inspector');
const key = path.join(identity.root, 'input.vue');
const store = { snapshot: () => ({ candidatesById: [[key, ['flex', 'extra']]], sourceById: [[key, '中文 flex extra']], inlineIncludedCandidates: [], inlineExcludedCandidates: [] }), values: () => new Set(['extra', 'flex']), getRevision: () => 2 };
globalThis[Symbol.for(${JSON.stringify(diagnosticSymbol)})].registerStore(store);
${viteOperationFixture(`globalThis[Symbol.for(${JSON.stringify(diagnosticSymbol)})]`)}
await diagnosticGenerate();
function allocateFixture() { return Array.from({ length: 20000 }, (_, i) => ({ text: 'fixture-' + i, values: new Array(32).fill(i) })); }
const allocation = allocateFixture();
await globalThis[Symbol.for(${JSON.stringify(diagnosticSymbol)})].compilation({ sourceCandidates: store.values(), runtime: new Set(['flex']), transformRuntime: new Set(['flex']), generatorRuntime: store.values() });
if (allocation.length !== 20000) throw new Error('fixture');
`
      const { cwd, entry } = await createUniServiceFixture(versionRoot, source)
      await fs.writeFile(path.join(cwd, uniProject.sourceFile), '中文 flex extra')
      const diagnostics = await createCaseDiagnostics({ allocation: mode, cwd, versionMeta: { ...versionFor(versionRoot), diagnosticIdentity: { role, sourceCommit: 'a'.repeat(40) } }, projectMeta: uniProject, directory: path.join(root, 'evidence'), kind: 'build', run: 1 })
      await runNode(entry, diagnostics.env)
      await diagnostics.finish()
      const directory = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_ALLOCATION_SESSION).sessionDirectory
      const startup = JSON.parse(await fs.readFile(path.join(directory, 'process-start.json'), 'utf8'))
      expect(startup).toMatchObject({ nodeVersion: process.version, executable: await fs.realpath(process.execPath) })
      const controller = JSON.parse(await fs.readFile(path.join(directory, 'allocation-controller.json'), 'utf8'))
      const inputs = JSON.parse(await fs.readFile(path.join(directory, 'inputs-1.json'), 'utf8'))
      expect(controller).toMatchObject({ diagnosticOnly: true, status: { complete: true, compilationCount: 1 } })
      expect(controller.sources[0].sha256).toBe(sha256('中文 flex extra'))
      expect(inputs.compilationCandidates.sourceCandidates).toEqual(['extra', 'flex'])
      expect(inputs.sources[0].maps.sourceById[0]).toMatchObject({ comparableKey: '<root>/input.vue', sha256: sha256('中文 flex extra') })
      const files = await fs.readdir(directory)
      expect(files.includes('allocation-1.json')).toBe(mode === 'allocation')
      if (mode === 'allocation') {
        const profile = decodeAllocationEvidence(await fs.readFile(path.join(directory, 'allocation-1.json')), inputs.profileReceipt)
        expect(profile.sampling.parameters).toMatchObject({ includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
        expect(profile.sampling.profile.samples.length).toBeGreaterThan(0)
        const frames = decodeAllocationEvidence(await fs.readFile(path.join(directory, inputs.framesFile)))
        expect(frames.allocationFrames.length).toBeGreaterThan(0)
        expect(frames.profileReceipt).toEqual(inputs.profileReceipt)
        const profileFile = path.join(directory, inputs.profileFile)
        const inputFile = path.join(directory, 'inputs-1.json')
        const originalProfile = await fs.readFile(profileFile)
        const originalInputs = await fs.readFile(inputFile)
        const envelope = JSON.parse(originalProfile.toString())
        expect(envelope.encoding).toMatch(/\.v1$/)
        const invalidProfile = Buffer.from(originalProfile.toString().replace(envelope.encoding, envelope.encoding.replace(/\.v1$/, '.v2')))
        expect(invalidProfile.length).toBe(originalProfile.length)
        expect(invalidProfile.equals(originalProfile)).toBe(false)
        await fs.writeFile(profileFile, invalidProfile)
        await fs.writeFile(inputFile, originalInputs.toString().replace(inputs.profileReceipt.sha256, sha256(invalidProfile)))
        await expect(diagnostics.finish()).rejects.toThrow('结构无效')
        await fs.writeFile(profileFile, originalProfile)
        await fs.writeFile(inputFile, originalInputs)
        const statusFile = path.join(directory, 'status.json')
        const originalStatus = await fs.readFile(statusFile)
        const missingReceipt = JSON.parse(originalStatus)
        delete missingReceipt.frameReceipts[0].receipt
        await fs.writeFile(statusFile, JSON.stringify(missingReceipt))
        await expect(diagnostics.finish()).rejects.toThrow('receipt')
        await fs.writeFile(statusFile, originalStatus)
        const corrupted = await fs.readFile(path.join(directory, inputs.framesFile))
        corrupted[0] = 91
        await fs.writeFile(path.join(directory, inputs.framesFile), corrupted)
        await expect(diagnostics.finish()).rejects.toThrow('栈映射缺失或哈希不匹配')
      }
      controllers.push(controller)
    }
    expect(controllers[0].moduleHashes).toEqual(controllers[1].moduleHashes)
  }, 30000)

  it('实际写入不同于预期或 worker 缺失证据时明确失败，保留错误 manifest', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allocation-missing-'))
    roots.push(root)
    const { cwd } = await createUniServiceFixture(root)
    const source = path.join(cwd, uniProject.sourceFile)
    await fs.writeFile(source, 'original')
    const diagnostics = await createCaseDiagnostics({ allocation: 'inputs', cwd, versionMeta: versionFor(root), projectMeta: uniProject, directory: path.join(root, 'evidence'), kind: 'hmr', run: 1 })
    await expect(diagnostics.source('mutation-written', source, 'different')).rejects.toThrow('预期不符')
    await expect(diagnostics.finish()).rejects.toThrow()
    const directory = JSON.parse(diagnostics.env.WEAPP_TW_BENCH_ALLOCATION_SESSION).sessionDirectory
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'allocation-controller.json'), 'utf8'))
    expect(manifest.error).toBeTruthy()
    expect(manifest.sources[1]).toMatchObject({ sha256: sha256('original'), expectedSha256: sha256('different') })
  })
})
