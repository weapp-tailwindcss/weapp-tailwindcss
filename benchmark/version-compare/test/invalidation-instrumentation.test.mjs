import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import ts from 'typescript'
import { afterEach, expect, it } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { instrumentInvalidationSource, invalidationTargets } from '../scripts/diagnostics/invalidation-instrumentation.mjs'
import { loadSource, readSource } from './helpers/uni-input.mjs'

afterEach(() => { delete globalThis[Symbol.for(diagnosticSymbol)] })

it.each(invalidationTargets)('真实 %s 锚点有效，锚点缺失及重复插桩明确失败', async (kind, relative) => {
  const source = await readSource(relative)
  const result = instrumentInvalidationSource(source, kind, relative)
  const ast = ts.createSourceFile(relative, result.source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  expect(ast.parseDiagnostics).toEqual([])
  expect(result.source).toContain(diagnosticSymbol)
  const name = result.anchor.anchors[0].name
  expect(() => instrumentInvalidationSource(source.replaceAll(`${name}(`, 'missingAnchor('), kind, relative)).toThrow('锚点')
  expect(() => instrumentInvalidationSource(result.source, kind, relative)).toThrow('重复')
})

function executable(source) {
  const ast = ts.createSourceFile('fixture.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  for (const node of [...ast.statements].reverse()) {
    if (ts.isImportDeclaration(node)) source = source.slice(0, node.getStart(ast)) + source.slice(node.end)
  }
  return ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
}

it('真实 Node 失效交接保留单次迭代，记录精确依赖、候选命中与前后版本', async () => {
  const rootFile = invalidationTargets.find(([kind]) => kind === 'root-invalidation')[1]
  const compilerFile = invalidationTargets.find(([kind]) => kind === 'compiler-invalidation')[1]
  const rootSource = await readSource(rootFile)
  const compilerSource = await readSource(compilerFile)
  const ast = ts.createSourceFile(compilerFile, compilerSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  let fn
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'invalidate') fn = node
    ts.forEachChild(node, visit)
  }
  visit(ast)
  const invalidateSource = `export ${fn.getText(ast)}`
  const modules = [false, true].map(observed => executable(`
class DefaultCompilationSession {}
function isFileMatchedByTailwindSourceEntries(file) { return file === '/src/page.vue' }
${observed ? instrumentInvalidationSource(rootSource, 'root-invalidation', rootFile).source : rootSource}
const rootStore = new CompilerRootStore(8);
function ensureActive() {}
${observed ? instrumentInvalidationSource(invalidateSource, 'compiler-invalidation', compilerFile).source : invalidateSource}
export { rootStore };
`))
  const script = `
import assert from 'node:assert/strict';
const modules = ${JSON.stringify(modules)};
const symbol = Symbol.for(${JSON.stringify(diagnosticSymbol)});
const events = [];
const identities = new WeakMap(); let identityCount = 0;
const operations = {
  identity(value) { if (!value || typeof value !== 'object') return; if (!identities.has(value)) identities.set(value, ++identityCount); return identities.get(value) },
  emit(name, details) { events.push({ name, details }) },
  sync(name, details, run) { events.push({ name: name + '.start', details }); const result = run(); events.push({ name: name + '.success', result }); return result },
};
async function scenario(source, observed) {
  delete globalThis[symbol];
  const { rootStore, invalidate } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64') + '#' + Math.random());
  const component = rootStore.get('component'); const other = rootStore.get('other');
  let reads = 0; const generator = {}; Object.defineProperty(component, 'generator', { get() { reads++; return generator } });
  rootStore.attachDependencies(component, ['/config.ts']); rootStore.attachSources(component, [{ base: '/src', pattern: '*.vue' }]);
  if (observed) globalThis[symbol] = { operations };
  let iterations = 0;
  function* ids() { for (const id of ['/config.ts', '/src/page.vue', 'other']) { iterations++; yield id } }
  const input = ids();
  const affected = invalidate(input);
  assert.deepEqual(invalidate(input), []);
  const state = { affected, iterations, component: [component.invalidation, component.engineInvalidation], other: [other.invalidation, other.engineInvalidation] };
  if (!observed) assert.equal(reads, 0);
  return state;
}
const plain = await scenario(modules[0], false);
const absent = await scenario(modules[1], false);
const observed = await scenario(modules[1], true);
assert.deepEqual(absent, plain); assert.deepEqual(observed, plain);
assert.deepEqual(plain, { affected: ['component', 'other'], iterations: 3, component: [1, 1], other: [1, 1] });
const trace = events.find(e => e.name === 'compiler.root.invalidate').details;
assert.deepEqual(trace.inputs, ['/config.ts', '/src/page.vue', 'other']);
assert.deepEqual(trace.matches.map(e => [e.id, e.rootId, e.reason]), [['/config.ts', 'component', 'dependency'], ['/src/page.vue', 'component', 'source'], ['other', 'other', 'root']]);
assert.deepEqual(trace.revisions.map(e => [e.rootId, e.before.engineInvalidation, e.after.engineInvalidation]), [['component', 0, 1], ['other', 0, 1]]);
console.log('invalidation fixture passed');
`
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 10000 })
  expect(result.error).toBeUndefined()
  expect(result.status, result.stderr).toBe(0)
  expect(result.stdout).toContain('invalidation fixture passed')
})

it('watchChange 未注册时保留 getter 次数，注册后记录真实 id/event，损坏协议明确失败', async () => {
  const file = invalidationTargets.find(([kind]) => kind === 'watch-change')[1]
  const original = await readSource(file)
  const instrumented = instrumentInvalidationSource(original, 'watch-change', file).source
  async function scenario(source, observer) {
    delete globalThis[Symbol.for(diagnosticSymbol)]
    const { createFrameworkSourceCandidatesPlugin } = await loadSource(source, { vitePluginName: 'fixture' })
    const calls = []; let reads = 0
    const plugin = createFrameworkSourceCandidatesPlugin({ shouldSkipSourceCandidateState: () => true, removeViteProcessedCssSource: async id => { calls.push(id) } })
    const change = { get event() { reads++; return 'delete' } }
    if (observer !== undefined) globalThis[Symbol.for(diagnosticSymbol)] = observer
    await plugin.watchChange('/src/page.vue', change)
    return { calls, reads }
  }
  const plain = await scenario(original)
  expect(await scenario(instrumented)).toEqual(plain)
  const events = []
  const observed = await scenario(instrumented, { operations: { emit: (name, details) => events.push({ name, details }) } })
  expect(observed.calls).toEqual(plain.calls)
  expect(observed.reads).toBe(plain.reads + 1)
  expect(events).toEqual([{ name: 'vite.watchChange', details: { id: '/src/page.vue', event: 'delete' } }])
  await expect(scenario(instrumented, { operations: {} })).rejects.toThrow()
})

it('服务失效事件关联 root、pool 与原租约，调用异常原样传播', async () => {
  const file = invalidationTargets.find(([kind]) => kind === 'service-invalidation')[1]
  const source = instrumentInvalidationSource(await readSource(file), 'service-invalidation', file).source
  const events = []; const marker = new Error('invalidate failed')
  class CompilerGeneratorServicePool {
    invalidate(value) { if (value.fail) throw marker; events.push({ invalidate: value }) }
    matches() { return true }
  }
  const { createCompilerGeneratorServices } = await loadSource(source, { CompilerGeneratorServicePool })
  const generator = {}; const root = { id: 'component', appliedEngineInvalidation: 0, generator }
  const service = createCompilerGeneratorServices({})
  expect(service.select(root, {}, 1, {}).generator).toBe(generator)
  expect(events).toEqual([{ invalidate: generator }])
  events.length = 0
  globalThis[Symbol.for(diagnosticSymbol)] = { operations: { identity: value => value === generator ? 2 : 1, sync(name, details, run) { events.push({ name, details }); return run() } } }
  expect(service.select(root, {}, 1, {}).generator).toBe(generator)
  expect(events[0]).toEqual({ name: 'compiler.service.invalidate', details: { poolId: 1, rootId: 'component', generatorId: 2, appliedEngineInvalidation: 0, engineInvalidation: 1 } })
  expect(events[1]).toEqual({ invalidate: generator })
  root.generator = { fail: true }
  expect(() => service.select(root, {}, 1, {})).toThrow(marker)
})
