import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getCompilerContext } from '@/context'
import { createCompilerContextCacheKey, withCompilerContextCache } from '@/context/compiler-context-cache'

const originalEnv = process.env

function clearCompilerContextCache() {
  const holder = globalThis as {
    __WEAPP_TW_COMPILER_CONTEXT_CACHE__?: Map<string, unknown>
  }
  holder.__WEAPP_TW_COMPILER_CONTEXT_CACHE__?.clear()
}

describe('compiler context cache', () => {
  beforeEach(() => {
    process.env = { ...originalEnv }
    clearCompilerContextCache()
  })

  afterEach(() => {
    process.env = originalEnv
    clearCompilerContextCache()
  })

  it('isolates mutable state for identical option values', () => {
    const ctxA = getCompilerContext({
      cssEntries: ['src/app.weapp.css'],
      cssChildCombinatorReplaceValue: ['view', 'text'],
    })
    const ctxB = getCompilerContext({
      cssChildCombinatorReplaceValue: ['view', 'text'],
      cssEntries: ['src/app.weapp.css'],
    })

    expect(ctxA).not.toBe(ctxB)
    expect(ctxA.tailwindRuntime).not.toBe(ctxB.tailwindRuntime)
    expect(ctxA.tailwindRuntime).not.toBe(ctxB.tailwindRuntime)
    expect(ctxA.tailwindRuntime).toBe(ctxA.tailwindRuntime)
  })

  it('creates new context when options differ', () => {
    const ctxA = getCompilerContext({
      cssEntries: ['src/app.weapp.css'],
    })
    const ctxB = getCompilerContext({
      cssEntries: ['src/native.weapp.css'],
    })

    expect(ctxA).not.toBe(ctxB)
  })

  it('normalizes maps and regex when building cache keys', () => {
    const ctxA = getCompilerContext({
      customAttributes: new Map<string | RegExp, (string | RegExp)[]>([
        ['view', [/^foo$/, 'bar']],
      ]),
    })
    const ctxB = getCompilerContext({
      customAttributes: new Map<string | RegExp, (string | RegExp)[]>([
        ['view', [/^foo$/, 'bar']],
      ]),
    })

    expect(ctxA).not.toBe(ctxB)
  })

  it('creates isolated context when runtime package scope differs with implicit basedir', () => {
    // 回归保护：
    // 当同一进程里连续构建多个项目，且 options 隐式/一致时，
    // cache 仍必须按 runtime package scope 隔离，防止 Tailwind context 串用。
    const firstProject = path.resolve(process.cwd(), 'demo/uni-app-vite-tailwindcss-v4')
    const secondProject = path.resolve(process.cwd(), 'demo/taro-vite-vue3-tailwindcss-v4')

    process.env['npm_package_json'] = path.join(firstProject, 'package.json')
    process.env['PNPM_PACKAGE_NAME'] = '@weapp-tailwindcss-demo/taro-vite-vue3-tailwindcss-v4'
    const ctxA = getCompilerContext()

    process.env['npm_package_json'] = path.join(secondProject, 'package.json')
    process.env['PNPM_PACKAGE_NAME'] = '@weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4'
    const ctxB = getCompilerContext()

    expect(ctxA).not.toBe(ctxB)
    expect(ctxA.tailwindcssBasedir).toBe(firstProject)
    expect(ctxB.tailwindcssBasedir).toBe(secondProject)
  })

  it('isolates contexts while preserving explicit project configuration', () => {
    const firstProject = path.resolve(process.cwd(), 'demo/uni-app-vite-tailwindcss-v4')
    const secondProject = path.resolve(process.cwd(), 'demo/uni-app-vite-tailwindcss-v4')
    const options = {
      tailwindcssBasedir: firstProject,
    }

    process.env['npm_package_json'] = path.join(firstProject, 'package.json')
    process.env['PNPM_PACKAGE_NAME'] = '@weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4'
    const ctxA = getCompilerContext(options)

    process.env['npm_package_json'] = path.join(secondProject, 'package.json')
    process.env['PNPM_PACKAGE_NAME'] = '@weapp-tailwindcss-demo/uni-app-vite-tailwindcss-v4'
    const ctxB = getCompilerContext(options)

    expect(ctxA).not.toBe(ctxB)
    expect(ctxA.tailwindcssBasedir).toBe(firstProject)
    expect(ctxB.tailwindcssBasedir).toBe(firstProject)
  })

  it('creates stable keys for complex serializable option values', () => {
    const fn = () => 'stable'
    const baseOptions = {
      tailwindcssBasedir: process.cwd(),
      values: {
        arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
        bigint: BigInt(42),
        buffer: Buffer.from('hello'),
        date: new Date('2026-01-01T00:00:00.000Z'),
        fn,
        map: new Map<unknown, unknown>([
          ['b', 2],
          ['a', 1],
        ]),
        nan: Number.NaN,
        negativeInfinity: Number.NEGATIVE_INFINITY,
        negativeZero: -0,
        positiveInfinity: Number.POSITIVE_INFINITY,
        promise: Promise.resolve('ignored'),
        regexp: /foo/gi,
        set: new Set(['b', 'a']),
        symbol: Symbol('token'),
        typedArray: new Uint16Array([10, 20]),
        undefinedValue: undefined,
        url: new URL('https://example.com/demo'),
        weakMap: new WeakMap(),
        weakSet: new WeakSet(),
      },
    }
    const sameOptionsDifferentOrder = {
      values: {
        weakSet: new WeakSet(),
        weakMap: new WeakMap(),
        url: new URL('https://example.com/demo'),
        undefinedValue: undefined,
        typedArray: new Uint16Array([10, 20]),
        symbol: Symbol('token'),
        set: new Set(['a', 'b']),
        regexp: /foo/gi,
        promise: Promise.resolve('ignored'),
        positiveInfinity: Number.POSITIVE_INFINITY,
        negativeZero: -0,
        negativeInfinity: Number.NEGATIVE_INFINITY,
        nan: Number.NaN,
        map: new Map<unknown, unknown>([
          ['a', 1],
          ['b', 2],
        ]),
        fn,
        date: new Date('2026-01-01T00:00:00.000Z'),
        buffer: Buffer.from('hello'),
        bigint: BigInt(42),
        arrayBuffer: new Uint8Array([1, 2, 3]).buffer,
      },
      tailwindcssBasedir: process.cwd(),
    }

    expect(createCompilerContextCacheKey(baseOptions)).toBe(createCompilerContextCacheKey(sameOptionsDifferentOrder))
  })

  it('returns undefined for circular options instead of throwing', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular

    expect(createCompilerContextCacheKey(circular)).toBeUndefined()
  })

  it('does not cache mutable factory results when a key can be created', () => {
    const factory = () => ({ value: Symbol('ctx') } as never)
    const options = {
      tailwindcssBasedir: process.cwd(),
      cssEntries: ['src/app.css'],
    }

    const first = withCompilerContextCache(options, factory)
    const second = withCompilerContextCache(options, factory)

    expect(first).not.toBe(second)
  })

  it('uses function identity for callbacks with identical source and different captures', () => {
    const capture = (value: string) => () => value
    const first = { tailwindcssBasedir: process.cwd(), onLoad: capture('first') }
    const second = { tailwindcssBasedir: process.cwd(), onLoad: capture('second') }
    expect(first.onLoad.toString()).toBe(second.onLoad.toString())
    expect(createCompilerContextCacheKey(first)).not.toBe(createCompilerContextCacheKey(second))
    expect(createCompilerContextCacheKey(first)).toBe(createCompilerContextCacheKey({ ...first }))
  })

  it('invalidates preparation keys when the same options object changes', () => {
    const options = { tailwindcssBasedir: process.cwd(), cssEntries: ['first.css'] }
    const previous = createCompilerContextCacheKey(options)
    options.cssEntries.push('second.css')
    expect(createCompilerContextCacheKey(options)).not.toBe(previous)
  })

  it('does not cache factory results when options cannot be keyed', () => {
    const circular: Record<string, unknown> = {}
    circular['self'] = circular
    const first = withCompilerContextCache(circular, () => ({ value: 1 } as never))
    const second = withCompilerContextCache(circular, () => ({ value: 2 } as never))

    expect(first).not.toBe(second)
  })
})
