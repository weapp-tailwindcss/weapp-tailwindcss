import { afterEach, expect, it } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { instrumentUniInputSource } from '../scripts/diagnostics/uni-instrumentation.mjs'
import { eventObserver, loadSource } from './helpers/uni-input.mjs'

afterEach(() => { delete globalThis[Symbol.for(diagnosticSymbol)] })
const source = `
export function createHook(context) {
 const state = { iteration: 0 };
 return async function generateBundle(_opt, bundle, services) {
  if (context.shouldProcessBundle?.() === false) { await context.onSkipProcessBundle?.(); return; }
  const useIncrementalMode = true, processMarkupAndScripts = true, processStyles = true;
  const snapshot = context.snapshot(bundle);
  const processFiles = snapshot.processFiles;
  for (const entry of snapshot.entries) {
   const { file } = entry;
   if (file === 'skip.js') continue;
   processHtmlBundleEntry(context);
   await processViteCssBundleEntry(context);
   processJsBundleEntry(context);
   replayCleanJsBundleEntry(context);
  }
  return this;
 }
}`
function snapshot(bundle) {
  return { entries: Object.entries(bundle).map(([file, output]) => ({ file, output, type: 'js', source: output.code })), processFiles: { js: new Set(['a.js']), css: new Set(), html: new Set() }, changedByType: {}, runtimeAffectingChangedByType: {}, linkedImpactsByEntry: new Map(), removedFiles: new Set(), hasOmittedKnownFiles: false }
}

it('真实 Node 语义 fixture 保留 this、同步起始顺序和原 await，raw/snapshot 在 entry 任务前固定', async () => {
  const order = []
  const bindings = { processHtmlBundleEntry: () => order.push('html'), processViteCssBundleEntry: () => order.push('css'), processJsBundleEntry: () => order.push('js'), replayCleanJsBundleEntry: () => order.push('replay') }
  const code = instrumentUniInputSource(source, 'runtime', 'runtime.ts').source
  const { createHook } = await loadSource(code, bindings)
  const host = { name: 'host' }
  const bundle = { 'a.js': { type: 'chunk', code: 'original' } }
  const context = { snapshot }
  const plainTask = createHook(context).call(host, {}, bundle)
  expect(order).toEqual(['html', 'css'])
  expect(await plainTask).toBe(host)
  expect(order).toEqual(['html', 'css', 'js', 'replay'])
  order.length = 0
  const { observer, events } = eventObserver()
  expect(await createHook(context).call(host, {}, bundle)).toBe(host)
  expect(order).toEqual(['html', 'css', 'js', 'replay'])
  const input = events.findIndex(event => event.name === 'uni.bundle.input')
  const snap = events.findIndex(event => event.name === 'uni.snapshot')
  const task = events.findIndex(event => event.name === 'uni.phase.runtime.processHtmlBundleEntry.start')
  expect(input).toBeLessThan(snap)
  expect(snap).toBeLessThan(task)
  expect(observer.summary().bundles[0]).toMatchObject({ raw: true, snapshot: true, closed: true })
})

it('插桩原调用抛出 falsy 值保持原拒绝身份，未启用不读取原始资产详情', async () => {
  const code = instrumentUniInputSource(source, 'runtime', 'runtime.ts').source
  const { createHook } = await loadSource(code, { processHtmlBundleEntry() { throw 0 }, processViteCssBundleEntry() {}, processJsBundleEntry() {}, replayCleanJsBundleEntry() {} })
  const bundle = { 'a.js': { type: 'chunk', get code() { throw new Error('diagnostic-only input') } } }
  const context = { snapshot: () => ({ ...snapshot({}), entries: [{ file: 'a.js', output: { type: 'chunk' }, source: 'raw' }] }) }
  await expect(createHook(context)({}, bundle)).rejects.toBe(0)
  eventObserver()
  await expect(createHook({ snapshot })({}, { 'a.js': { type: 'chunk', code: 'raw' } })).rejects.toBe(0)
})


it('同一工厂的正常 skip prehook 不建立假 bundle，最终处理 hook 才留存输入', async () => {
  const { createHook } = await loadSource(instrumentUniInputSource(source, 'runtime', 'runtime.ts').source, { processHtmlBundleEntry() {}, processViteCssBundleEntry() {}, processJsBundleEntry() {}, replayCleanJsBundleEntry() {} })
  const { observer, events } = eventObserver()
  let checks = 0
  let skips = 0
  const bundle = { 'a.js': { type: 'chunk', code: 'raw' } }
  await createHook({ shouldProcessBundle() { checks++; return false }, onSkipProcessBundle() { skips++ }, snapshot() { throw new Error('skip 不应创建 snapshot') } })({}, bundle)
  expect([checks, skips]).toEqual([1, 1])
  expect(observer.summary().bundles).toEqual([])
  expect(events).toEqual([])
  await createHook({ snapshot })({}, bundle)
  expect(observer.summary().bundles).toHaveLength(1)
})
