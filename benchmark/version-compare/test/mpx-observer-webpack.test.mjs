import path from 'node:path'
import ts from 'typescript'
import { afterEach, expect, it, vi } from 'vitest'
import { createObserver, observerKey } from './helpers/mpx-observer.mjs'
import { actualSource, findNodes, loadSource } from './helpers/mpx-source.mjs'

afterEach(() => {
  delete globalThis[observerKey]
})

it('真实扫描缓存的 source、signature 与 lookup 支持无观察器及动态注册', async () => {
  const read = vi.fn(() => '.a{}')
  const module = await loadSource(await actualSource('scan'), `
const path = fixture.path;
const stat = () => ({ mtimeMs: 1, size: 4 });
const readSourceCandidateFile = fixture.read;
const md5Hash = value => value;
const resolveSourceScanPath = value => value;
const isSourceCandidateRequest = () => true;
const resolveSourceCandidateScanFiles = () => ['source.vue'];
const createSourceCandidateScanSignature = () => '{}';
const forEachSourceCandidateFile = async (files, visit) => { for (const file of files) await visit(file); };
`, { path, read })
  const collector = {
    clearScan: vi.fn(),
    syncInline: vi.fn(),
    sync: vi.fn(),
    restore: vi.fn(),
    sourcesForEntries: () => [],
    snapshot: () => ({ candidatesById: [] }),
  }
  const cache = module.createWebpackSourceCandidateScanCache()
  const invoke = () => cache.resolve({ collector, root: '/fixture', outDir: '/fixture/dist', watchMode: true })
  expect((await invoke()).signatureHash).toBe('{}')
  const observer = createObserver()
  globalThis[observerKey] = observer
  expect((await invoke()).signatureHash).toBe('{}')
  expect(observer.events.map(event => event.name)).toEqual(['scan.signature', 'scan.lookup.start', 'scan.lookup.success', 'scan.source'])
  delete globalThis[observerKey]
  expect((await invoke()).signatureHash).toBe('{}')
  expect(read).toHaveBeenCalledTimes(3)
  expect(collector.sync).toHaveBeenCalledOnce()
  expect(observer.events).toHaveLength(4)
  const failure = new Error('original read error')
  read.mockRejectedValueOnce(failure)
  await expect(invoke()).rejects.toBe(failure)
  for (const broken of [null, {}, { operations: {} }]) {
    globalThis[observerKey] = broken
    await expect(invoke()).rejects.toThrow()
  }
})

async function webpackHooks(instrumented, fixture) {
  const source = await actualSource('webpack', instrumented)
  const { ast, matches } = findNodes(source, (node, ast) => ts.isCallExpression(node) && node.expression.getText(ast) === 'compiler.hooks.compilation.tap')
  expect(matches).toHaveLength(1)
  const body = matches[0].arguments[1].body
  const registration = body.statements.findIndex(statement => statement.getText(ast).startsWith('compilation.hooks.processAssets.tapPromise'))
  expect(registration).toBeGreaterThan(0)
  const created = body.statements.slice(0, registration).map(statement => statement.getText(ast)).join('\n')
  const { matches: finalizers } = findNodes(source, (node, ast) => ts.isCallExpression(node) && node.expression.getText(ast) === 'finalizeWebpackProcessAssets')
  expect(finalizers).toHaveLength(1)
  const finalizer = finalizers[0]
  const statement = finalizer.parent.parent
  const tail = statement.parent.statements.slice(statement.parent.statements.indexOf(statement))
  const bindings = finalizer.arguments[0].properties.filter(ts.isShorthandPropertyAssignment).map(property => property.name.text)
  const completed = tail.map(node => node.getText(ast)).join('\n')
  return loadSource(`export function created(compilation) { ${created} }
export async function completed(compilation) { ${completed} }`, `
const { ${bindings.join(', ')}, runtimeState, finalizeWebpackProcessAssets, finalizeCompilerShadowRun, ensureCompilerOwnerActive } = fixture;
const isWebGeneratorTarget = false;
const webpackSourceCandidateSet = new Set(), runtimeSet = new Set(), transformRuntimeSet = new Set(), generatorRuntimeSet = new Set();
`, fixture)
}

it('真实 Webpack hook 无 observer 不增加完成阶段微任务，保留同步异常', async () => {
  async function run(instrumented) {
    const trace = []
    const fixture = {
      ensureCompilerOwnerActive: () => trace.push('active'),
      finalizeWebpackProcessAssets: () => {
        trace.push('finalize')
        return Promise.resolve()
      },
      finalizeCompilerShadowRun: () => trace.push('shadow'),
    }
    const hooks = await webpackHooks(instrumented, fixture)
    expect(hooks.created({})).toBeUndefined()
    const completed = hooks.completed({}).then(() => trace.push('done'))
    void Promise.resolve().then(() => trace.push('microtask-1')).then(() => trace.push('microtask-2'))
    await completed
    return trace
  }
  expect(await run(true)).toEqual(await run(false))
  const failure = new Error('original webpack failure')
  const hooks = await webpackHooks(true, {
    ensureCompilerOwnerActive: () => { throw failure },
    finalizeWebpackProcessAssets: () => Promise.reject(failure),
    finalizeCompilerShadowRun: () => { throw new Error('unreachable') },
  })
  expect(() => hooks.created({})).toThrow(failure)
  await expect(hooks.completed({})).rejects.toBe(failure)
})

it('真实 Webpack hook 运行中注册观察器保留 this、等待与损坏协议失败', async () => {
  const shadow = vi.fn()
  const active = vi.fn()
  const hooks = await webpackHooks(true, {
    ensureCompilerOwnerActive: active,
    finalizeWebpackProcessAssets: vi.fn(() => Promise.resolve()),
    finalizeCompilerShadowRun: shadow,
  })
  const compilation = {}
  hooks.created(compilation)
  await hooks.completed(compilation)
  let release
  const pending = new Promise((resolve) => {
    release = resolve
  })
  const observer = {
    webpackCreated: vi.fn(function (value) {
      expect(this).toBe(observer)
      expect(value).toBe(compilation)
    }),
    webpackCompleted: vi.fn(function (value) {
      expect(this).toBe(observer)
      expect(value).toBe(compilation)
      return pending
    }),
  }
  globalThis[observerKey] = observer
  hooks.created(compilation)
  const completing = hooks.completed(compilation)
  await Promise.resolve()
  expect(observer.webpackCompleted).toHaveBeenCalledOnce()
  expect(shadow).toHaveBeenCalledOnce()
  release()
  await completing
  delete globalThis[observerKey]
  hooks.created(compilation)
  await hooks.completed(compilation)
  expect(active).toHaveBeenCalledTimes(3)
  expect(shadow).toHaveBeenCalledTimes(3)
  expect(observer.webpackCreated).toHaveBeenCalledOnce()
  expect(observer.webpackCompleted).toHaveBeenCalledOnce()
  for (const broken of [null, {}, { operations: {} }]) {
    globalThis[observerKey] = broken
    expect(() => hooks.created(compilation)).toThrow()
    await expect(hooks.completed(compilation)).rejects.toThrow()
  }
})
