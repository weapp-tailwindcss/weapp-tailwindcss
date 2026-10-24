import { afterEach, expect, it, vi } from 'vitest'
import { createObserver, observerKey } from './helpers/mpx-observer.mjs'
import { actualSource, loadSource } from './helpers/mpx-source.mjs'

afterEach(() => {
  delete globalThis[observerKey]
})

const servicePrelude = `
const snapshotConfiguration = value => value;
const createGeneratorServiceKey = source => source.css;
const copyGeneratorServiceResult = value => value;
const createWeappTailwindcssGenerator = () => { throw new Error('explicit factory required'); };
`

it('真实服务池无 observer 时保持返回、this、调用次数和关闭 Promise 身份', async () => {
  const { CompilerGeneratorServicePool } = await loadSource(await actualSource('service'), servicePrelude)
  const result = { css: 'a{}' }
  const factory = vi.fn(() => ({
    generate: vi.fn(function () {
      expect(this).toBe(factory.mock.results[0].value)
      return Promise.resolve(result)
    }),
    dispose: vi.fn(() => undefined),
  }))
  const pool = new CompilerGeneratorServicePool(factory)
  expect(pool.matches(undefined, { css: 'a{}' }, {})).toBe(false)
  const lease = pool.acquire({ css: 'a{}' }, {})
  expect(pool.matches(lease, { css: 'a{}' }, {})).toBe(true)
  expect(await lease.generate({})).toBe(result)
  const closing = lease.dispose()
  expect(lease.dispose()).toBe(closing)
  await closing
  const shutdown = pool.dispose()
  expect(pool.dispose()).toBe(shutdown)
  await shutdown
  expect(factory).toHaveBeenCalledOnce()
  expect(factory.mock.results[0].value.generate).toHaveBeenCalledOnce()
  expect(factory.mock.results[0].value.dispose).toHaveBeenCalledOnce()
})

it('同一已加载服务模块允许 observer 后注册、移除与损坏诊断', async () => {
  const { CompilerGeneratorServicePool } = await loadSource(await actualSource('service'), servicePrelude)
  const pool = new CompilerGeneratorServicePool()
  const invoke = () => pool.matches(undefined, { css: 'a{}' }, {})
  expect(invoke()).toBe(false)
  const active = createObserver()
  globalThis[observerKey] = active
  expect(invoke()).toBe(false)
  expect(active.events.map(event => event.name)).toEqual(['service.matches.start', 'service.matches.success'])
  delete globalThis[observerKey]
  expect(invoke()).toBe(false)
  expect(active.events).toHaveLength(2)
  for (const broken of [null, {}, { operations: {} }]) {
    globalThis[observerKey] = broken
    expect(invoke).toThrow()
  }
  delete globalThis[observerKey]
  await pool.dispose()
})

it.each([false, true])('真实原生池无 observer 保留同步失败或 Promise 拒绝 (%s)', async (asynchronous) => {
  const { TailwindV4NativeSessionPool } = await loadSource(await actualSource('native'))
  const error = new Error('original generation failure')
  const session = {}
  const generate = vi.fn(function () {
    expect(this).toBe(session)
    if (asynchronous) {
      return Promise.reject(error)
    }
    throw error
  })
  const release = vi.fn(() => undefined)
  Object.assign(session, { generate, dispose: release })
  const pool = new TailwindV4NativeSessionPool(() => session)
  const pending = pool.generate('weapp', 'key', { css: 'a{}' }, {})
  await expect(pending).rejects.toBe(error)
  expect(generate).toHaveBeenCalledOnce()
  await pool.dispose()
  expect(release).toHaveBeenCalledOnce()
})
