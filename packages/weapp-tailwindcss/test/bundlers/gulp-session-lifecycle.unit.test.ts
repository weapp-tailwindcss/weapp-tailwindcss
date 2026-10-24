import type { Transform } from 'node:stream'
import { Buffer } from 'node:buffer'
import path from 'node:path'
import process from 'node:process'
import Vinyl from 'vinyl'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPlugins } from '@/bundlers/gulp'
import { createCache } from '@/cache'

let context: any
vi.mock('@/context', () => ({ createCompilerContext: () => context }))

function write(stream: Transform, name: string) {
  stream.resume()
  stream.on('error', () => {})
  return new Promise<void>((resolve, reject) => {
    stream.write(new Vinyl({
      cwd: process.cwd(),
      base: process.cwd(),
      path: path.resolve(`${name}.css`),
      contents: Buffer.from(`.${name}{color:red}`),
    }), error => error ? reject(error) : resolve())
  })
}

describe('公开 Gulp 实例关闭协调', () => {
  beforeEach(() => {
    const runtimeSet = new Set(['p-4'])
    const runtime = {
      majorVersion: 3,
      getClassSet: async () => runtimeSet,
      getClassSetSync: () => runtimeSet,
      extract: async () => ({ classSet: runtimeSet }),
    }
    context = {
      cache: createCache(),
      styleHandler: vi.fn(async (css: string) => ({ css })),
      jsHandler: vi.fn((code: string) => ({ code })),
      templateHandler: vi.fn(async (html: string) => html),
      mainCssChunkMatcher: () => false,
      tailwindRuntime: runtime,
      refreshTailwindcssRuntime: async () => runtime,
    }
  })

  it('排空已接受的文件后才清缓存，重复关闭同 Promise，关闭后拒绝旧 stream 和新任务', async () => {
    const entered = Promise.withResolvers<void>()
    const released = Promise.withResolvers<void>()
    context.styleHandler.mockImplementation(async (css: string) => {
      entered.resolve()
      await released.promise
      return { css }
    })
    const reset = vi.fn()
    const options = { __internalGulpRuntimeClassSetManager: { reset } }
    const plugins = createPlugins(options as any)
    const stream = plugins.transformWxss()
    const task = write(stream, 'pending')
    await entered.promise
    const closing = plugins.dispose()
    expect(plugins.dispose()).toBe(closing)
    await Promise.resolve()
    expect(reset).not.toHaveBeenCalled()
    released.resolve()
    await Promise.all([task, closing])
    expect(reset).toHaveBeenCalledOnce()
    expect(context.cache.instance.size).toBe(0)
    expect(context.cache.hashMap.size).toBe(0)
    expect(plugins.dispose()).toBe(closing)
    expect(() => plugins.transformWxss()).toThrow('已释放')
    expect(() => plugins.watchChange(path.resolve('gone.css'))).toThrow('已释放')
    await expect(write(stream, 'late')).rejects.toThrow('已释放')
    expect(options.__internalGulpRuntimeClassSetManager.reset).toBe(reset)
    expect(context.styleHandler).toBeTypeOf('function')
  })

  it('扩展清理失败仍清空全部缓存和转换服务，错误结果保持幂等', async () => {
    const reset = vi.fn(() => {
      throw new Error('reset failed')
    })
    const plugins = createPlugins({ __internalGulpRuntimeClassSetManager: { reset } } as any)
    const stream = plugins.transformWxss()
    await write(stream, 'cached')
    expect(context.cache.instance.size).toBeGreaterThan(0)
    expect(context.cache.hashMap.size).toBeGreaterThan(0)
    const closing = plugins.dispose()
    await expect(closing).rejects.toThrow('释放失败')
    expect(context.cache.instance.size).toBe(0)
    expect(context.cache.hashMap.size).toBe(0)
    expect(plugins.dispose()).toBe(closing)
    await expect(write(stream, 'late')).rejects.toThrow('已释放')
    expect(reset).toHaveBeenCalledOnce()
  })

  it('公开 generateWxss 到 adaptWxss 的在途管线在关闭前完整提交样式', async () => {
    const entered = Promise.withResolvers<void>()
    const released = Promise.withResolvers<void>()
    context.styleHandler.mockImplementation(async (css: string) => {
      entered.resolve()
      await released.promise
      return { css: css.replace('red', 'blue') }
    })
    const reset = vi.fn()
    const plugins = createPlugins({ __internalGulpRuntimeClassSetManager: { reset } } as any)
    const generation = plugins.generateWxss()
    const adaptation = plugins.adaptWxss()
    generation.pipe(adaptation)
    const output = new Promise<Vinyl>(resolve => adaptation.once('data', resolve))
    const task = write(generation, 'pipeline')
    const closing = plugins.dispose()
    await entered.promise
    expect(reset).not.toHaveBeenCalled()
    released.resolve()
    const [result] = await Promise.all([output, task, closing])
    expect(result.contents?.toString()).toContain('color:blue')
    expect(context.styleHandler).toHaveBeenCalledOnce()
    expect(reset).toHaveBeenCalledOnce()
    generation.end()
  })

  it('一个 stream 的转换失败允许同一 watch 实例下一轮恢复', async () => {
    const plugins = createPlugins()
    context.styleHandler.mockRejectedValueOnce(new Error('recoverable'))
    await expect(write(plugins.transformWxss(), 'failed')).rejects.toThrow('recoverable')
    const stream = plugins.transformWxss()
    await expect(write(stream, 'recovered')).resolves.toBeUndefined()
    expect(context.cache.instance.size).toBeGreaterThan(0)
    stream.end()
    await plugins.dispose()
    expect(context.cache.instance.size).toBe(0)
  })
})
