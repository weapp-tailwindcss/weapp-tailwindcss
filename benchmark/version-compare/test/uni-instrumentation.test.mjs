import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { generationTargets } from '../scripts/diagnostics/operation-instrumentation.mjs'
import { prepareAllocationRoot } from '../scripts/diagnostics/prepare.mjs'
import { instrumentUniInputSource, uniInputTargets } from '../scripts/diagnostics/uni-instrumentation.mjs'
import { cacheFixture, eventObserver, loadSource, readSource, sourceRoot } from './helpers/uni-input.mjs'

const roots = []
afterEach(async () => {
  delete globalThis[Symbol.for(diagnosticSymbol)]
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})
const store = 'packages/weapp-tailwindcss/src/project-sources/candidates/store.ts'
const finalize = 'packages/weapp-tailwindcss/src/bundlers/vite/generate-bundle/finalize/bundle.ts'

it('全部真实 Uni 锚点及 cache callback 先验证，再写准备副本', async () => {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'uni-input-prepare-'))
  roots.push(temporary)
  const root = path.join(temporary, 'copy')
  const files = [store, finalize, ...generationTargets.map(([, relative]) => relative), ...uniInputTargets.map(([, relative]) => relative)]
  for (const relative of files) {
    const file = path.join(root, relative)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.copyFile(path.join(sourceRoot, relative), file)
  }
  const file = path.join(root, uniInputTargets.find(([kind]) => kind === 'js-asset')[1])
  const original = await fs.readFile(file, 'utf8')
  const originalStore = await fs.readFile(path.join(root, store), 'utf8')
  await fs.writeFile(file, original.replace('onCacheHit()', 'unknownHit()'))
  await expect(prepareAllocationRoot(root, sourceRoot, path.join(temporary, 'evidence'), 'demo-uni-app-vite-tailwindcss-v4__mp-weixin', 'inputs')).rejects.toThrow('回调锚点')
  expect(await fs.readFile(path.join(root, store), 'utf8')).toBe(originalStore)
  await fs.writeFile(file, original)
  const manifest = await prepareAllocationRoot(root, sourceRoot, path.join(temporary, 'evidence'), 'demo-uni-app-vite-tailwindcss-v4__mp-weixin', 'inputs')
  expect(manifest.filter(item => item.anchor.kind.startsWith('uni-'))).toHaveLength(8)
  expect(await fs.readFile(path.join(root, finalize), 'utf8')).toContain('uniInput.completed({ metrics, timingDetails })')
  await expect(prepareAllocationRoot(root, sourceRoot, path.join(temporary, 'again'), 'demo-uni-app-vite-tailwindcss-v4__mp-weixin', 'inputs')).rejects.toThrow('重复')
  const control = path.join(temporary, 'allocation-control')
  for (const relative of [store, finalize, ...generationTargets.map(([, name]) => name)]) {
    const file = path.join(control, relative)
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.copyFile(path.join(sourceRoot, relative), file)
  }
  const allocationManifest = await prepareAllocationRoot(control, sourceRoot, path.join(temporary, 'control-evidence'), 'demo-uni-app-vite-tailwindcss-v4__mp-weixin', 'allocation')
  expect(allocationManifest.some(item => item.anchor.kind.startsWith('uni-'))).toBe(false)
  expect(await fs.readFile(path.join(control, finalize), 'utf8')).not.toContain('uniInput')
})

it.each(uniInputTargets)('真实 %s 锚点产生有效源码，缺失原调用即失败', async (kind, relative) => {
  const source = await readSource(relative)
  const result = instrumentUniInputSource(source, kind, relative)
  expect(result.source).toContain('uniInput')
  const anchor = result.anchor.anchors[0].name
  const broken = source.replaceAll(`${anchor}(`, 'missingCall(')
  expect(() => instrumentUniInputSource(broken, kind, relative)).toThrow('锚点')
})

it('真实 JS asset 上首次 miss、重复 hit、改源 miss 与未插桩调用及输出一致', async () => {
  const relative = uniInputTargets.find(([kind]) => kind === 'js-asset')[1]
  const original = await readSource(relative)
  const { processCachedTask } = await loadSource(await readSource('packages/weapp-tailwindcss/src/bundlers/shared/cache.ts'))
  async function scenario(source, observed) {
    const cache = cacheFixture()
    const calls = { handler: 0, matcher: 0, updates: 0 }
    const { createFrameworkJsAssetContext } = await loadSource(source, { processCachedTask, toAbsoluteOutputPath: (file, outDir) => path.resolve(outDir, file), shouldSkipViteJsTransform() { calls.matcher++; return false }, createFrameworkAssetAccess: bundle => ({ read: () => bundle }) })
    const asset = { type: 'asset', source: 'one' }
    const options = { asset, bundle: { 'a.js': asset }, file: 'a.js', source: 'one', outDir: sourceRoot, cache, hashKey: 'a', hashSalt: 'same', createHandlerOptions: () => ({}), debug() {}, disableJsPrecheck: false, jsHandler: async value => { calls.handler++; return { code: `${value}!` } }, onUpdate() { calls.updates++ }, runtimeSet: new Set(), shouldTransform: true, applyLinkedResults() {} }
    const run = async () => {
      const context = createFrameworkJsAssetContext(options)
      expect(context.shouldSkipTransform({})).toBe(false)
      const task = { hashSalt: 'task', transform: value => context.transformJs(value) }
      await context.runCachedTransform(task)
      asset.source = 'one'
      await context.runCachedTransform(task)
      asset.source = 'two'
      await context.runCachedTransform(task)
      return asset.source
    }
    const output = observed ? await observed.bundle(run) : await run()
    return { calls, cache: cache.calls, output }
  }
  const plain = await scenario(original)
  const { observer, events } = eventObserver()
  const observed = await scenario(instrumentUniInputSource(original, 'js-asset', relative).source, observer)
  expect(observed).toEqual(plain)
  expect(observed).toEqual({ calls: { handler: 2, matcher: 1, updates: 2 }, cache: { lookups: 3, transforms: 2, hits: 1 }, output: 'two!' })
  expect(events.filter(event => event.name === 'uni.cache').map(event => event.details.state)).toEqual(['transform-entered', 'local-hit', 'transform-entered'])
  expect(events.filter(event => event.name === 'uni.phase.js-asset.options.jsHandler.span')).toHaveLength(2)
})

it('无观察器时真实 asset context 不读诊断 file getter，也不额外等待', async () => {
  const relative = uniInputTargets.find(([kind]) => kind === 'js-asset')[1]
  const source = instrumentUniInputSource(await readSource(relative), 'js-asset', relative).source
  const value = Promise.resolve({ code: 'same' })
  const { createFrameworkJsAssetContext } = await loadSource(source, { processCachedTask() {}, toAbsoluteOutputPath() {}, shouldSkipViteJsTransform: () => false, createFrameworkAssetAccess: () => ({ read() {} }) })
  let reads = 0
  const options = { get file() { reads++; return 'a.js' }, jsHandler: () => value, createHandlerOptions: () => ({}), runtimeSet: new Set() }
  const context = createFrameworkJsAssetContext(options)
  const before = reads
  expect(await context.transformJs('x')).toEqual({ code: 'same' })
  expect(reads).toBe(before)
})
