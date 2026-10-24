import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { instrumentDiagnosticSource, prepareAllocationRoot } from '../scripts/diagnostics/prepare.mjs'

const storeTarget = { relative: 'store.ts', kind: 'store', name: 'createSourceCandidateStore' }
const bundleTarget = { relative: 'bundle.ts', kind: 'compilation', name: 'finalizeGenerateBundle' }
const storeSource = 'export function createSourceCandidateStore() { return { snapshot() { return {} }, values() { return new Set() }, sources() { return [] }, getRevision() { return 1 } } }'
const bundleSource = 'export async function finalizeGenerateBundle(options) { const { sourceCandidates, runtime, transformRuntime, generatorRuntime, onEnd } = options; onEnd() }'
const roots = []
afterEach(async () => {
  delete globalThis[Symbol.for(diagnosticSymbol)]
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})
async function load(source) {
  const output = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText
  return import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}#${Math.random()}`)
}

describe('仅 benchmark 副本内的 AST 观测注入', () => {
  it('store 返回身份与行为保持，实际对象通过唯一观测点登记', async () => {
    const registerStore = vi.fn()
    globalThis[Symbol.for(diagnosticSymbol)] = { registerStore }
    const instrumented = instrumentDiagnosticSource(storeSource, storeTarget)
    const module = await load(instrumented.source)
    const store = module.createSourceCandidateStore()
    expect(registerStore).toHaveBeenCalledExactlyOnceWith(store)
    expect(store.getRevision()).toBe(1)
    delete globalThis[Symbol.for(diagnosticSymbol)]
    expect(module.createSourceCandidateStore().getRevision()).toBe(1)
  })

  it('Vite 完成边界等待完整观测，失败按原异步调用链传播', async () => {
    let release
    const wait = new Promise((resolve) => {
      release = resolve
    })
    const compilation = vi.fn(() => wait)
    globalThis[Symbol.for(diagnosticSymbol)] = { compilation }
    const module = await load(instrumentDiagnosticSource(bundleSource, bundleTarget).source)
    const onEnd = vi.fn()
    const candidates = new Set(['flex'])
    const task = module.finalizeGenerateBundle({ sourceCandidates: candidates, runtime: candidates, transformRuntime: candidates, generatorRuntime: candidates, onEnd })
    expect(onEnd).not.toHaveBeenCalled()
    expect(compilation.mock.calls[0][0].sourceCandidates).toBe(candidates)
    release()
    await task
    expect(onEnd).toHaveBeenCalledOnce()
    compilation.mockRejectedValueOnce(new Error('missing evidence'))
    await expect(module.finalizeGenerateBundle({ onEnd })).rejects.toThrow('missing evidence')
    expect(onEnd).toHaveBeenCalledOnce()
  })

  it('锚点缺失、重复、返回契约变化及重复注入全部明确失败', () => {
    for (const source of ['', `${storeSource}\n${storeSource}`, storeSource.replace('snapshot', 'different'), 'export function createSourceCandidateStore() { return other }']) {
      expect(() => instrumentDiagnosticSource(source, storeTarget)).toThrow()
    }
    expect(() => instrumentDiagnosticSource(bundleSource.replace('onEnd() }', 'onEnd(); onEnd() }'), bundleTarget)).toThrow('唯一')
    expect(() => instrumentDiagnosticSource(instrumentDiagnosticSource(storeSource, storeTarget).source, storeTarget)).toThrow('重复')
  })

  it('拒绝源码树和 Git checkout，两个锚点均验证前不写入任何副本源码', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'allocation-prepare-'))
    roots.push(root)
    await expect(prepareAllocationRoot(root, root, path.join(root, 'evidence'))).rejects.toThrow('源码工作树')
    const copy = path.join(root, 'copy')
    await fs.mkdir(copy)
    await fs.writeFile(path.join(copy, '.git'), 'gitdir: elsewhere')
    await expect(prepareAllocationRoot(copy, root, path.join(root, 'evidence'))).rejects.toThrow('Git 元数据')
    await fs.rm(path.join(copy, '.git'))
    const storeFile = path.join(copy, 'packages/weapp-tailwindcss/src/project-sources/candidates/store.ts')
    await fs.mkdir(path.dirname(storeFile), { recursive: true })
    await fs.writeFile(storeFile, storeSource)
    await expect(prepareAllocationRoot(copy, root, path.join(root, 'evidence'))).rejects.toThrow()
    expect(await fs.readFile(storeFile, 'utf8')).toBe(storeSource)
  })
})
