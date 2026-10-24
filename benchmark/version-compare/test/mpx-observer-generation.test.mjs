import path from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { createObserver, observerKey } from './helpers/mpx-observer.mjs'
import { actualFunction, actualSource, loadSource } from './helpers/mpx-source.mjs'

afterEach(() => {
  delete globalThis[observerKey]
})

const source = { css: '.a{}', base: '/fixture', baseFallbacks: [], dependencies: [] }

it('真实生成器在同一模块中直通、注册、移除 observer，保留关闭 Promise', async () => {
  const artifact = { css: '.a{}' }
  const generate = vi.fn(() => Promise.resolve(artifact))
  const dispose = vi.fn()
  const module = await loadSource(await actualSource('generator'), `
const TailwindV4NativeSessionPool = class { dispose() { return fixture.dispose(); } };
const createEngineTailwindV4Engine = () => ({ dispose: fixture.dispose });
const incrementalGenerateCache = new Map();
const generateRawArtifact = fixture.generate;
const transformGeneratedArtifact = value => value;
`, { generate, dispose })
  const engine = module.createTailwindV4Engine(source)
  expect(await engine.generate()).toBe(artifact)
  const observer = createObserver()
  globalThis[observerKey] = observer
  expect(await engine.generate()).toBe(artifact)
  expect(observer.events.map(event => event.name)).toEqual(['generator.generate.start', 'generator.generate.success'])
  delete globalThis[observerKey]
  expect(await engine.generate()).toBe(artifact)
  expect(generate).toHaveBeenCalledTimes(3)
  expect(observer.events).toHaveLength(2)
  const failure = new Error('original error')
  generate.mockRejectedValueOnce(failure)
  await expect(engine.generate()).rejects.toBe(failure)
  for (const broken of [null, {}, { operations: {} }]) {
    globalThis[observerKey] = broken
    await expect(engine.generate()).rejects.toThrow()
    expect(() => module.createTailwindV4Engine(source)).toThrow()
  }
  delete globalThis[observerKey]
  const closing = engine.dispose()
  expect(engine.dispose()).toBe(closing)
  await closing
  expect(dispose).toHaveBeenCalledTimes(2)
})

it('真实原生池支持运行中注册和移除 observer，保留复用与释放计数', async () => {
  const { TailwindV4NativeSessionPool } = await loadSource(await actualSource('native'))
  const artifact = { css: '.a{}' }
  const session = { generate: vi.fn(() => Promise.resolve(artifact)), dispose: vi.fn() }
  const create = vi.fn(() => session)
  const pool = new TailwindV4NativeSessionPool(create)
  expect(await pool.generate('weapp', 'same', source, {})).toBe(artifact)
  const observer = createObserver()
  globalThis[observerKey] = observer
  expect(await pool.generate('weapp', 'same', source, {})).toBe(artifact)
  expect(observer.events.map(event => event.name)).toEqual(['native.reuse', 'native.generate.start', 'native.generate.success'])
  delete globalThis[observerKey]
  expect(await pool.generate('weapp', 'same', source, {})).toBe(artifact)
  expect(create).toHaveBeenCalledOnce()
  expect(session.generate).toHaveBeenCalledTimes(3)
  expect(observer.events).toHaveLength(3)
  for (const broken of [null, {}, { operations: {} }]) {
    globalThis[observerKey] = broken
    expect(() => pool.generate('weapp', 'same', source, {})).toThrow()
  }
  delete globalThis[observerKey]
  await pool.dispose()
  expect(session.dispose).toHaveBeenCalledOnce()
})

it('真实 engine 直通 build 和 undefined 生命周期，不丢 this 或重复执行函数体', async () => {
  const clear = vi.fn()
  const module = await loadSource(await actualSource('engine'), `
const clearRequireCache = fixture.clear;
const invalidateGenerationModuleCache = fixture.clear;
const toGenerateOptions = value => value;
const shouldCompileSourceEntries = () => false;
const collectRawCandidates = () => new Set(['a']);
const resolveValidTailwindV4Candidates = (_design, values) => values;
const extractTailwindV4InlineSourceCandidates = () => ({ excluded: [] });
const canonicalizeBareArbitraryValueCandidates = value => value;
const replaceBareArbitraryValueSelectors = value => value;
`, { clear })
  const engine = module.createTailwindGenerationSession(source)
  const runtime = {
    dependencies: new Set(),
    builtCandidates: new Set(),
    compiled: {
      build: vi.fn(function () {
        expect(this).toBe(runtime.compiled)
        return '.a{}'
      }),
    },
  }
  engine.getRuntime = () => Promise.resolve(runtime)
  expect((await engine.generateInternal({})).css).toBe('.a{}')
  expect(engine.invalidate({ type: 'configuration' })).toBeUndefined()
  expect(clear).toHaveBeenCalledTimes(2)
  const observer = createObserver()
  globalThis[observerKey] = observer
  expect((await engine.generateInternal({})).css).toBe('.a{}')
  expect(engine.invalidate({ type: 'configuration' })).toBeUndefined()
  expect(observer.events.map(event => event.name)).toEqual(['engine.build.start', 'engine.build.success', 'engine.invalidate.start', 'engine.invalidate.success'])
  delete globalThis[observerKey]
  expect((await engine.generateInternal({})).css).toBe('.a{}')
  expect(runtime.compiled.build).toHaveBeenCalledTimes(3)
  const failure = new Error('original build error')
  runtime.compiled.build.mockImplementationOnce(() => {
    throw failure
  })
  await expect(engine.generateInternal({})).rejects.toBe(failure)
  for (const broken of [null, {}, { operations: {} }]) {
    globalThis[observerKey] = broken
    expect(() => module.createTailwindGenerationSession(source)).toThrow()
    expect(() => engine.invalidate({ type: 'configuration' })).toThrow()
  }
  delete globalThis[observerKey]
  expect(engine.dispose()).toBeUndefined()
  expect(clear).toHaveBeenCalledTimes(5)
  expect(engine.invalidate({ type: 'configuration' })).toBeUndefined()
  expect(clear).toHaveBeenCalledTimes(5)
})

it.each([false, true])('真实 compile 保留接收者与原始错误，动态 observer 不缓存 (%s)', async (asynchronous) => {
  const compiled = { build() {} }
  const node = {
    compile: vi.fn(function () {
      expect(this).toBe(node)
      return Promise.resolve(compiled)
    }),
  }
  const { compileTailwindV4Source } = await loadSource(actualFunction(await actualSource('compile'), 'compileTailwindV4Source'), `
const unique = values => [...new Set(values)];
const loadTailwindV4NodeModule = () => fixture.node;
const prepareGenerationModuleRequests = css => ({ css, files: [] });
const withGenerationModuleCache = (_node, run) => run();
const createFallbackCssResolver = () => undefined;
const path = fixture.path;
`, { node, path })
  expect((await compileTailwindV4Source(source)).compiled).toBe(compiled)
  const observer = createObserver()
  globalThis[observerKey] = observer
  expect((await compileTailwindV4Source(source)).compiled).toBe(compiled)
  expect(observer.events.map(event => event.name)).toEqual(['engine.compile.start', 'engine.compile.success'])
  delete globalThis[observerKey]
  expect((await compileTailwindV4Source(source)).compiled).toBe(compiled)
  expect(node.compile).toHaveBeenCalledTimes(3)
  expect(observer.events).toHaveLength(2)
  const failure = new Error('original compile error')
  node.compile.mockImplementationOnce(() => {
    if (asynchronous) {
      return Promise.reject(failure)
    }
    throw failure
  })
  await expect(compileTailwindV4Source(source)).rejects.toBe(failure)
  for (const broken of [null, {}, { operations: {} }]) {
    globalThis[observerKey] = broken
    await expect(compileTailwindV4Source(source)).rejects.toThrow()
  }
  expect(node.compile).toHaveBeenCalledTimes(4)
})
