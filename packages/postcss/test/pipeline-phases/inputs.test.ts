import type { Plugin, ProcessOptions, Result } from 'postcss'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { createStylePipeline } from '@/pipeline'
import { gate, options } from './helpers'

describe('阶段管线原生输入与错误边界', () => {
  it.each([0, 1, 2])('整 Document 的 %s 个子 Root 保留结构与明确的新阶段次数', async (count) => {
    const prepare = vi.fn(() => ({}))
    const once = vi.fn()
    const documentVisitor = vi.fn()
    const legacy = vi.fn()
    const stringifier = vi.fn(postcss.stringify)
    const document = postcss.document({ nodes: Array.from({ length: count }, (_, i) => postcss.parse(`.a${i}{width:calc(1px + 2px)}`)) })
    const roots = [...document.nodes]
    const pipeline = createStylePipeline(options({ postcssOptions: { plugins: [
      { postcssPlugin: 'author', prepare, Once: once, Document: documentVisitor },
      legacy,
    ] } }))
    const result = await pipeline.process(document, { from: undefined, stringifier })
    expect(result.root).toBe(document)
    expect(result.root.nodes).toHaveLength(count)
    roots.forEach((root, index) => {
      expect(result.root.nodes[index]).toBe(root)
    })
    expect(prepare).toHaveBeenCalledTimes(1)
    expect(once).toHaveBeenCalledTimes(count)
    expect(documentVisitor).toHaveBeenCalledTimes(1)
    expect(legacy).toHaveBeenCalledTimes(1)
    expect(legacy.mock.calls[0]?.[0]).toBe(document)
    expect(stringifier).toHaveBeenCalledTimes(2)
    roots.forEach((root) => {
      expect(root.toString()).toContain('width:3px')
    })
  })

  it.each([false, true])('有效空作者 bundle 不创建作者处理，原输入只解析一次：map=%s', async (mapped) => {
    const parser = vi.fn(postcss.parse)
    const source = { toString: vi.fn(() => '.a{width:calc(1px + 2px)}') }
    const processOptions = { from: undefined, parser, map: mapped ? { inline: false, annotation: false } : false }
    const pipeline = createStylePipeline(options({ postcssOptions: { plugins: [postcss([])] } }))
    expect(pipeline.kind).toBe('phased')
    const result = await pipeline.process(source, processOptions)
    expect(parser).toHaveBeenCalledTimes(1)
    expect(parser.mock.calls[0]?.[0]).toBe(source)
    expect(source.toString).toHaveBeenCalledTimes(1)
    expect(result.opts).toBe(processOptions)
    expect(result.css).toBe('.a{width:3px}')
  })

  for (const lazy of [false, true]) {
    for (const mapped of [false, true]) {
      it.each(['absent', 'external', 'false'] as const)(`首次原生处理接收完整输入：lazy=${lazy} mapped=${mapped} opts=%s`, async (mapPolicy) => {
        const upstream = postcss([{ postcssPlugin: 'upstream' }]).process('.a{width:calc(1px + 2px)}', { from: 'upstream.css', map: mapped ? { inline: false, annotation: false } : false })
        const completed = await upstream
        completed.messages.push({ type: 'upstream-only', plugin: 'upstream' })
        const input = lazy ? upstream : completed
        const processOptions: ProcessOptions = { from: 'consumer.css', to: 'consumer.out.css' }
        if (mapPolicy === 'external') {
          processOptions.map = { inline: false, annotation: false }
        }
        if (mapPolicy === 'false') {
          processOptions.map = false
        }
        let author: Result | undefined
        const pipeline = createStylePipeline(options({ postcssOptions: { plugins: [{
          postcssPlugin: 'author',
          prepare(result) {
            author = result
            return {}
          },
        }] } }))
        if (mapped && mapPolicy === 'false') {
          expect(() => pipeline.process(input, processOptions)).toThrow(TypeError)
          expect(author).toBeUndefined()
          return
        }
        const result = await pipeline.process(input, processOptions)
        expect(author?.root).toBe(completed.root)
        expect(result.root).toBe(completed.root)
        expect(result.opts).toBe(processOptions)
        expect(author?.opts).not.toBe(processOptions)
        expect(author?.opts.map).toBe(false)
        expect(result.messages.some(message => message.type === 'upstream-only')).toBe(false)
        if (mapped) {
          expect(processOptions.map).toMatchObject({ inline: false })
          const map = processOptions.map
          if (typeof map !== 'object') {
            throw new TypeError('Expected native map injection')
          }
          expect(map.prev).toBe(completed.map)
          expect(result.map.toJSON().sources).toEqual(['upstream.css'])
        }
        expect(result.css).toContain('width:3px')
      })
    }
  }

  it('pending LazyResult 首次原生同步错误不变成隐式等待，原运行仍显式收尾', async () => {
    const blocked = gate()
    const started = gate()
    const parent = postcss([{ postcssPlugin: 'pending', async Once() {
      started.release()
      await blocked.promise
    } }]).process('.a{}', { from: undefined })
    const running = parent.async()
    const prepare = vi.fn(() => ({}))
    try {
      await started.promise
      const pipeline = createStylePipeline(options({ postcssOptions: { plugins: [{ postcssPlugin: 'author', prepare }] } }))
      expect(() => pipeline.process(parent, { from: undefined })).toThrow(/async/)
      expect(prepare).not.toHaveBeenCalled()
    }
    finally {
      blocked.release()
      await running
    }
  })

  it('作者 prepare 的首同步错误保持对象身份，构造工厂也只执行一次', () => {
    const sentinel = { reason: 'author prepare' }
    const creator = vi.fn((): Plugin => ({ postcssPlugin: 'author', prepare() {
      throw sentinel
    } }))
    const pipeline = createStylePipeline(options({ postcssOptions: { plugins: [Object.assign(creator, { postcss: true as const })] } }))
    expect(creator).toHaveBeenCalledTimes(1)
    let caught: unknown
    try {
      pipeline.process('.a{}', { from: undefined })
    }
    catch (error) {
      caught = error
    }
    expect(caught).toBe(sentinel)
    expect(creator).toHaveBeenCalledTimes(1)
  })

  it.each(['author', 'serializer', 'platform', 'after'] as const)('后续 %s 错误以同一对象拒绝，无重试', async (phase) => {
    const sentinel = { reason: phase }
    const authorExit = vi.fn(() => {
      if (phase === 'author') {
        throw sentinel
      }
    })
    const platformPrepare = vi.fn(() => {
      if (phase === 'platform') {
        throw sentinel
      }
      ;
      return {}
    })
    const pipeline = createStylePipeline(options({
      postcssOptions: { plugins: [{ postcssPlugin: 'author', OnceExit: authorExit }] },
      cssPresetEnv: { stage: false, autoprefixer: false, features: { 'custom-media-queries': true }, insertBefore: { 'custom-media-queries': { postcssPlugin: 'platform', prepare: platformPrepare } } },
    }))
    const processOptions: ProcessOptions = { from: undefined }
    if (phase === 'serializer') {
      processOptions.stringifier = () => {
        throw sentinel
      }
    }
    await expect(pipeline.process('.a{}', processOptions, [{ postcssPlugin: 'after', OnceExit() {
      if (phase === 'after') {
        throw sentinel
      }
    } }])).rejects.toBe(sentinel)
    expect(authorExit).toHaveBeenCalledTimes(1)
    expect(platformPrepare).toHaveBeenCalledTimes(phase === 'author' || phase === 'serializer' ? 0 : 1)
  })
})
