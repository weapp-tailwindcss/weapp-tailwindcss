import { Buffer } from 'node:buffer'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { diagnosticSymbol } from '../scripts/diagnostics/constants.mjs'
import { instrumentViteTailSource } from '../scripts/diagnostics/vite-tail-instrumentation.mjs'
import { createViteTailObserver, verifyViteTailSummary } from '../scripts/diagnostics/vite-tail-observer.mjs'
import { cssSource, rollupSource, viteSource } from './vite-tail-fixtures.mjs'

const roots = []
afterEach(async () => {
  delete globalThis[Symbol.for(diagnosticSymbol)]
  await Promise.all(roots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})
const transpile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText
const load = source => import(`data:text/javascript;base64,${Buffer.from(transpile(source)).toString('base64')}#${Math.random()}`)

describe('诊断副本的 Taro 尾部阶段', () => {
  it('真实 Node 串起配置、停止点、CSS、write、reporter、close，保持结果和钩子调用顺序', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vite-tail-node-'))
    roots.push(root)
    for (const [kind, source] of [['css', cssSource], ['vite', viteSource], ['rollup', rollupSource]]) {
      await fs.writeFile(path.join(root, `${kind}.mjs`), transpile(instrumentViteTailSource(source, kind, `${kind}.ts`).source))
    }
    const observerUrl = pathToFileURL(fileURLToPath(new URL('../scripts/diagnostics/vite-tail-observer.mjs', import.meta.url))).href
    const script = `import assert from 'node:assert/strict';
import { createViteTailObserver, verifyViteTailSummary } from ${JSON.stringify(observerUrl)};
import { createViteCssFinalizerOutputPlugin } from './css.mjs';
import { build, buildReporterPlugin } from './vite.mjs';
import { rollupInternal } from './rollup.mjs';
const events = [], order = [];
const tail = createViteTailObserver({ operations: { emit(name, details) { events.push({ name, details }); return events.length; } } });
globalThis[Symbol.for(${JSON.stringify(diagnosticSymbol)})] = { viteTail: tail };
const config = await build({ command: 'build', mode: 'production', logLevel: 'silent', build: { sourcemap: false, reportCompressedSize: true, ssr: false, write: true, watch: null }, order, report: async () => {} });
const css = createViteCssFinalizerOutputPlugin({ opts: { cssMatcher: name => name.endsWith('.wxss') }, order, transform: async () => {} });
const reporter = buildReporterPlugin(config);
const output = { 'app.wxss': { type: 'asset', fileName: 'app.wxss', source: '.文本{}' }, 'app.js': { type: 'chunk', fileName: 'app.js', code: 'let a=1;', map: { toString() { throw new Error('不得序列化 sourcemap'); } } } };
const graph = { fileOperationQueue: { run: operation => operation() }, pluginDriver: { async hookParallel(name, args) { if (name === 'writeBundle') await reporter.writeBundle(...args); else order.push('close'); } }, async generate() { tail.point('main-finalizer'); tail.point('snapshot.before'); tail.point('snapshot.after'); await css.generateBundle.handler({}, output); return output; } };
const bundle = await rollupInternal(graph);
assert.equal(await bundle.write({ order }), output);
await bundle.close(); await bundle.close();
verifyViteTailSummary(tail.summary());
assert.deepEqual(order, ['css', 'write:app.wxss', 'write:app.js', 'reporter', 'close']);
assert.equal(events.find(event => event.details.phase === 'css-finalizer.end').details.bundle.assetUtf8Bytes, Buffer.byteLength('.文本{}'));
assert.equal(events.find(event => event.details.phase === 'css-finalizer.end').details.bundle.cssUtf8Bytes, 'unknown');
assert.equal(events.find(event => event.details.phase === 'rollup-write.end').details.bundle.cssUtf8Bytes, 'unknown');
assert.equal(events[0].details.configuration.sourcemap, false);
for (const event of events) for (const key of ['rss', 'heapUsed', 'external', 'arrayBuffers']) assert.equal(typeof event.details.memory[key], 'number');
process.stdout.write(JSON.stringify({ node: process.version, phases: events.length, order }));`
    const entry = path.join(root, 'entry.mjs')
    await fs.writeFile(entry, script)
    const { stdout } = await promisify(execFile)(process.execPath, [entry])
    expect(JSON.parse(stdout)).toMatchObject({ phases: 14, order: ['css', 'write:app.wxss', 'write:app.js', 'reporter', 'close'] })
  })

  it('未注册 observer 时不求值详情，不加 await；保留早返回、this 和异常身份', async () => {
    const module = await load(instrumentViteTailSource(cssSource, 'css', 'plugin.ts').source)
    const order = []
    const context = {
      order,
      immediate: 'same',
      get opts() { throw new Error('详情不得求值') },
    }
    const host = { name: 'host' }
    const task = module.createViteCssFinalizerOutputPlugin(context).generateBundle.handler.call(host, {}, {})
    expect(order).toEqual(['css'])
    expect(context.receivedThis).toBe(host)
    expect(await task).toBe('same')
    const error = new Error('原异常')
    context.fail = error
    await expect(module.createViteCssFinalizerOutputPlugin(context).generateBundle.handler({}, {})).rejects.toBe(error)
  })

  it('已注册 observer 保留错误身份并拒绝不完整阶段', async () => {
    const events = []
    const tail = createViteTailObserver({ operations: { emit(name, details) {
      events.push(details)
      return events.length
    } } })
    globalThis[Symbol.for(diagnosticSymbol)] = { viteTail: tail }
    const module = await load(instrumentViteTailSource(cssSource, 'css', 'plugin.ts').source)
    const error = new Error('原异常')
    const plugin = module.createViteCssFinalizerOutputPlugin({ fail: error, order: [], opts: { cssMatcher: () => true } })
    await expect(plugin.generateBundle.handler({}, {})).rejects.toBe(error)
    expect(events.map(event => event.phase)).toEqual(['css-finalizer.begin', 'css-finalizer.failure'])
    expect(() => verifyViteTailSummary(tail.summary())).toThrow('缺失')
    expect(() => verifyViteTailSummary(undefined)).toThrow('缺失')
  })

  it('observer 开启时不读取用户配置，不额外调用有状态或抛错的 matcher', async () => {
    const tail = createViteTailObserver({ operations: { emit: () => 1 } })
    globalThis[Symbol.for(diagnosticSymbol)] = { viteTail: tail }
    const module = await load(instrumentViteTailSource(cssSource, 'css', 'plugin.ts').source)
    let calls = 0
    const cssMatcher = () => {
      calls++
      throw new Error('用户 matcher 不应被 observer 调用')
    }
    const bundle = { 'app.wxss': { type: 'asset', fileName: 'app.wxss', source: '.flex{}' } }
    const plugin = module.createViteCssFinalizerOutputPlugin({ order: [], immediate: true, opts: { cssMatcher } })
    expect(await plugin.generateBundle.handler({}, bundle)).toBe(true)
    expect(calls).toBe(0)
    const hidden = module.createViteCssFinalizerOutputPlugin({
      order: [],
      immediate: true,
      get opts() { throw new Error('observer 不应读取配置') },
    })
    expect(await hidden.generateBundle.handler({}, bundle)).toBe(true)
  })

  it('observer 开启时不格式化用户抛出值，保留自定义异常身份', async () => {
    const tail = createViteTailObserver({ operations: { emit: () => 1 } })
    globalThis[Symbol.for(diagnosticSymbol)] = { viteTail: tail }
    const module = await load(instrumentViteTailSource(cssSource, 'css', 'plugin.ts').source)
    let formatted = false
    const error = { toString() {
      formatted = true
      throw new Error('不应格式化用户抛出值')
    } }
    const plugin = module.createViteCssFinalizerOutputPlugin({ fail: error, order: [] })
    await expect(plugin.generateBundle.handler({}, {})).rejects.toBe(error)
    expect(formatted).toBe(false)
  })

  it.each(['writer', 'budget'])('产品抛错后 %s 诊断失败仍保留原始异常，且证据失败关闭', async (failure) => {
    const accessed = []
    const arbitraryError = {
      get name() {
        accessed.push('name')
        throw new Error('不得读取 name')
      },
      get message() {
        accessed.push('message')
        throw new Error('不得读取 message')
      },
      toString() {
        accessed.push('toString')
        throw new Error('不得格式化')
      },
    }
    const tail = createViteTailObserver({ operations: { emit(name, details) {
      if (failure === 'writer' && details.phase.endsWith('.failure')) {
        throw arbitraryError
      }
      return 1
    } } })
    if (failure === 'budget') {
      for (let index = 0; index < 63; index++) {
        tail.point('fixture')
      }
    }
    globalThis[Symbol.for(diagnosticSymbol)] = { viteTail: tail }
    const module = await load(instrumentViteTailSource(cssSource, 'css', 'plugin.ts').source)
    const productError = { original: true }
    const plugin = module.createViteCssFinalizerOutputPlugin({ fail: productError, order: [] })
    await expect(plugin.generateBundle.handler({}, {})).rejects.toBe(productError)
    expect(accessed).toEqual([])
    expect(tail.summary()).toMatchObject({ recordingError: '尾部诊断记录失败（抛出类型：object）', pending: 0 })
    expect(() => verifyViteTailSummary(tail.summary())).toThrow('失败')
  })

  it('没有产品异常时原样报告 writer 抛出值，不格式化或吞掉诊断失败', async () => {
    let formatted = false
    const error = { toString() {
      formatted = true
      throw new Error('不应格式化诊断抛出值')
    } }
    const tail = createViteTailObserver({ operations: { emit(name, details) {
      if (details.phase.endsWith('.end')) {
        throw error
      }
      return 1
    } } })
    globalThis[Symbol.for(diagnosticSymbol)] = { viteTail: tail }
    const module = await load(instrumentViteTailSource(cssSource, 'css', 'plugin.ts').source)
    const plugin = module.createViteCssFinalizerOutputPlugin({ immediate: true, order: [] })
    await expect(plugin.generateBundle.handler({}, {})).rejects.toBe(error)
    expect(formatted).toBe(false)
    expect(tail.summary()).toMatchObject({ recordingError: '尾部诊断记录失败（抛出类型：object）', pending: 0 })
    expect(() => verifyViteTailSummary(tail.summary())).toThrow('失败')
  })

  it.each([undefined, null, false, 0, ''])('产品抛出 falsy 值 %s 时仍使用显式失败状态保留异常', async (error) => {
    const tail = createViteTailObserver({ operations: { emit(name, details) {
      if (details.phase.endsWith('.failure')) {
        throw new Error('诊断 writer 失败')
      }
      return 1
    } } })
    globalThis[Symbol.for(diagnosticSymbol)] = { viteTail: tail }
    const module = await load(instrumentViteTailSource(cssSource, 'css', 'plugin.ts').source)
    const plugin = module.createViteCssFinalizerOutputPlugin({ fail: error, order: [] })
    await expect(plugin.generateBundle.handler({}, {})).rejects.toBe(error)
    expect(tail.summary()).toMatchObject({ recordingError: '尾部诊断记录失败（抛出类型：object）', pending: 0 })
  })

  it('固定事件与资产上限拒绝超限，不能截断后宣称完整', () => {
    const tail = createViteTailObserver({ operations: { emit: () => 1 } })
    for (let index = 0; index < 64; index++) {
      tail.point('fixture')
    }
    expect(() => tail.point('fixture')).toThrow('上限')
    const other = createViteTailObserver({ operations: { emit: () => 1 } })
    const bundle = Object.fromEntries(Array.from({ length: 4097 }, (_, index) => [index, { type: 'asset', source: '' }]))
    expect(() => other.begin('css-finalizer', { bundle })).toThrow('资产数')
  })

  it('缺失、重复、未知布局与重复插桩明确失败', () => {
    for (const [kind, source] of [['css', cssSource], ['vite', viteSource], ['rollup', rollupSource]]) {
      expect(() => instrumentViteTailSource('', kind, 'fixture')).toThrow('唯一')
      expect(() => instrumentViteTailSource(`${source}\n${source}`, kind, 'fixture')).toThrow('唯一')
      const first = instrumentViteTailSource(source, kind, 'fixture')
      expect(() => instrumentViteTailSource(first.source, kind, 'fixture')).toThrow('重复')
    }
    expect(() => instrumentViteTailSource(rollupSource.replace('\'writeBundle\'', '\'other\''), 'rollup', 'fixture')).toThrow('唯一')
  })
})
