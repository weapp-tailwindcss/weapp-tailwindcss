import { afterEach, expect, it } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { instrumentUniInputSource, uniInputTargets } from '../scripts/diagnostics/uni-instrumentation.mjs'
import { cacheFixture, eventObserver, loadSource, readSource } from './helpers/uni-input.mjs'

afterEach(() => { delete globalThis[Symbol.for(diagnosticSymbol)] })

async function setup(observed) {
  const discardedViteCssSource = Symbol('discarded')
  const { processCachedTask } = await loadSource(await readSource('packages/weapp-tailwindcss/src/bundlers/shared/cache.ts'))
  const { processViteCssCacheTask } = await loadSource(await readSource('packages/weapp-tailwindcss/src/bundlers/vite/generate-bundle/css-cache-task.ts'), { processCachedTask, discardedViteCssSource })
  const relative = uniInputTargets.find(([kind]) => kind === 'css-schedule')[1]
  const source = await readSource(relative)
  const { scheduleViteCssTransform } = await loadSource(observed ? instrumentUniInputSource(source, 'css-schedule', relative).source : source, { discardedViteCssSource, recordViteCssContribution() {} })
  const cache = cacheFixture()
  const calls = { execute: 0, updates: 0, released: 0, applies: 0 }
  const sharedResultCache = new Map()
  let result = 'source'
  function options(extra = {}) {
    const isSourceCurrent = () => true
    isSourceCurrent.release = () => { calls.released++ }
    return { file: 'a.wxss', outputFile: 'a.wxss', rawSource: 'raw', generatorRawSource: 'raw', cssCacheKey: 'cache', cssHashKey: 'hash', cssTaskHash: 'task', cssSharedCacheKey: 'shared', cache, sharedCssResultCache: sharedResultCache, cssTaskFactories: [], debug() {}, metrics: { css: { cacheHits: 0, elapsed: 0, transformed: 0 } }, envFlags: {}, outputCssHandlerOptions: {}, rememberedCssSources: [], runtimeState: { tailwindRuntime: { majorVersion: 4 } }, snapshot: { changedByType: { css: new Set(['a.wxss']) } }, isSourceCurrent, processViteCssCacheTask, timeTask: (_, task) => task(), executeViteCssTransformTask: async () => { calls.execute++; return { css: 'generated' } }, applyViteCssTransformTaskResult: ({ result }) => result.css, applyViteCssCacheResult: (_, css) => { calls.applies++; result = css }, onUpdate() { calls.updates++ }, measureElapsed: start => performance.now() - start, ...extra }
  }
  return { cache, calls, sharedResultCache, options, scheduleViteCssTransform, discardedViteCssSource, result: () => result }
}

it.each(['local-hit', 'shared-result', 'shared-discarded', 'cancelled'])('真实 CSS scheduler %s 分支不改变转换、cache、release 和输出', async (kind) => {
  async function scenario(observed) {
    const f = await setup(observed)
    if (kind === 'shared-result') f.sharedResultCache.set('shared', Promise.resolve('shared-css'))
    if (kind === 'shared-discarded') {
      const failed = Promise.reject(f.discardedViteCssSource)
      void failed.catch(() => undefined)
      f.sharedResultCache.set('shared', failed)
    }
    const run = async () => {
      const first = f.options(kind === 'cancelled' ? { executeViteCssTransformTask: async () => { f.calls.execute++; throw f.discardedViteCssSource } } : {})
      f.scheduleViteCssTransform(first)
      await first.cssTaskFactories[0]()
      if (kind === 'local-hit') {
        const second = f.options()
        f.scheduleViteCssTransform(second)
        await second.cssTaskFactories[0]()
      }
    }
    const evidence = observed ? eventObserver() : undefined
    if (evidence) await evidence.observer.bundle(run)
    else await run()
    return { behavior: { calls: f.calls, cache: f.cache.calls, result: f.result() }, states: evidence?.events.filter(event => event.name === 'uni.cache').map(event => event.details.state) }
  }
  const plain = await scenario(false)
  const actual = await scenario(true)
  expect(actual.behavior).toEqual(plain.behavior)
  if (kind === 'local-hit') expect(actual.states).toEqual(['transform-entered', 'local-hit'])
  if (kind === 'shared-result') expect(actual.states).toEqual(['shared-attempt', 'shared-result'])
  if (kind === 'shared-discarded') {
    expect(actual.states).toEqual(['shared-attempt', 'transform-entered', 'shared-result'])
    expect(actual.behavior.calls.execute).toBe(1)
  }
  if (kind === 'cancelled') expect(actual.states).toEqual(['transform-entered', 'cancelled'])
})

it('JS clean 直接回放记录真实命中，未命中不会追加缓存读取', async () => {
  const relative = uniInputTargets.find(([kind]) => kind === 'js')[1]
  const source = instrumentUniInputSource(await readSource(relative), 'js', relative).source
  const { replayCleanJsBundleEntry } = await loadSource(source)
  const { observer, events } = eventObserver()
  let hashReads = 0
  let valueReads = 0
  const options = { entry: { file: 'a.js', source: 'raw', output: { type: 'chunk' } }, cache: { getHashValue() { hashReads++; return { hash: 'source:runtime:transform-filter:filter' } }, get() { valueReads++; return 'cached' } }, snapshot: { processFiles: { js: new Set() }, sourceHashByFile: new Map([['a.js', 'source']]) }, metrics: { js: { total: 0, cacheHits: 0 } }, useIncrementalMode: true, transformFilterSignature: 'filter', transformRuntimeSignature: 'runtime', rememberProcessCacheKey() {}, debug() {} }
  await observer.bundle(async () => {
    expect(replayCleanJsBundleEntry(options)).toBe(true)
    options.snapshot.processFiles.js.add('a.js')
    expect(replayCleanJsBundleEntry(options)).toBe(false)
  })
  expect([hashReads, valueReads]).toEqual([1, 1])
  expect(options.entry.output.code).toBe('cached')
  expect(events.filter(event => event.name === 'uni.cache').map(event => event.details.state)).toEqual(['direct-replay-hit'])
})


it('真实 asset adapter 的 precheck 早退只调用一次 matcher，保留未创建 cache task 的选择原因', async () => {
  const relative = uniInputTargets.find(([kind]) => kind === 'js-adapter')[1]
  const source = instrumentUniInputSource(await readSource(relative), 'js-adapter', relative).source
  const { createUniAppXAssetPipeline } = await loadSource(source, { isUniAppXEnabled: () => true, createUniAppXBundleAssetSourceGetter: () => () => undefined, UNI_APP_X_STYLE_PLACEHOLDER_VERSION: 'v1', injectUniAppXStylePlaceholder: (_, value) => value, applyHarmonyBundleStyles() {}, createHarmonyBundleStyleSources() {}, handleUniAppXPostCssTasks() {} })
  // pipeline 构造发生在 bundle 外，不能求值并不存在的 entry context。
  const pipeline = createUniAppXAssetPipeline({ uniAppX: true })
  const { observer, events } = eventObserver()
  let matcher = 0
  let cache = 0
  await observer.bundle(async () => {
    const task = pipeline.createJsAssetTask({ file: 'a.js', assets: {}, shouldTransform: true, shouldSkipTransform() { matcher++; return true }, runCachedTransform() { cache++ } })
    await task()
  })
  expect([matcher, cache]).toEqual([1, 0])
  const branch = events.find(event => event.name === 'uni.selection' && event.details.conditions.some(item => item.expression.includes('context.shouldTransform')))
  expect(branch.details.conditions[0].outcome).toBe(true)
})
