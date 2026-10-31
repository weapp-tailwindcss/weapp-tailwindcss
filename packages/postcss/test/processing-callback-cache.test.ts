import type { Parser, ProcessOptions, Stringifier } from 'postcss'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { createStyleHandler } from '../src/handler'
import { createOptionsResolver } from '../src/options-resolver'
import { StyleProcessorCache } from '../src/processor-cache'

const css = '.a{color:red}'

class StatefulSyntax {
  #parser: Parser

  constructor(color: string) {
    this.#parser = (source, options) => {
      const root = postcss.parse(source, options)
      root.walkDecls('color', (declaration) => {
        declaration.value = color
      })
      return root
    }
  }

  get parse() {
    return this.#parser
  }

  get stringify() {
    return postcss.stringify
  }
}

function createHandler(options?: ProcessOptions) {
  const onDiagnostic = vi.fn()
  const handler = createStyleHandler({
    cssPreflight: false,
    onDiagnostic,
    postcssOptions: { options },
  })
  return { handler, onDiagnostic }
}

describe('处理选项回调的外部状态不能作为完整结果缓存', () => {
  it.each(['parser', 'syntax'] as const)('关闭 Skyline 时不提前读取继承的 %s 访问器', async (key) => {
    const read = vi.fn(() => {
      throw new Error('不应求值的继承访问器')
    })
    const prototype = Object.create(null, { [key]: { get: read } })
    const options: ProcessOptions = Object.create(prototype)
    const { handler } = createHandler(options)
    expect((await handler(css)).css).toBe(css)
    expect((await handler(css)).css).toBe(css)
    expect(read).not.toHaveBeenCalled()
  })

  it('同一个 parser 闭包变化后，文本重新解析并与新 handler 一致', async () => {
    let color = 'red'
    const parser = vi.fn<Parser>((source, options) => {
      const root = postcss.parse(source, options)
      root.walkDecls('color', (declaration) => {
        declaration.value = color
      })
      return root
    })
    const options = { parser }
    const { handler, onDiagnostic } = createHandler(options)
    const first = await handler(css)
    const calls = parser.mock.calls.length
    color = 'blue'
    const second = await handler(css)
    expect(second.css).toBe((await createHandler(options).handler(css)).css)
    expect(second.css).not.toBe(first.css)
    expect(second.css).toContain('color:blue')
    expect(parser.mock.calls.length).toBeGreaterThan(calls)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
  })

  for (const mode of ['text', 'root'] as const) {
    it(`${mode} 每轮执行同一个 stringifier 闭包`, async () => {
      let banner = 'first'
      const stringifier = vi.fn<Stringifier>((root, builder) => {
        builder(`/* ${banner} */`)
        postcss.stringify(root, builder)
      })
      const options = { stringifier }
      const { handler, onDiagnostic } = createHandler(options)
      const root = postcss.parse(css, { from: 'same.css' })
      const run = () => mode === 'text' ? handler(css) : handler.transformRoot(root)
      const first = await run()
      const calls = stringifier.mock.calls.length
      banner = 'second'
      const second = await run()
      const fresh = createHandler(options).handler
      const expected = await (mode === 'text' ? fresh(css) : fresh.transformRoot(root))
      expect(second.css).toBe(expected.css)
      expect(second.css).not.toBe(first.css)
      expect(second.css).toContain('/* second */')
      expect(stringifier.mock.calls.length).toBeGreaterThan(calls)
      expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
      if (mode === 'root') {
        expect(second.root).not.toBe(first.root)
        expect(second.root.source?.input).toBe(root.source?.input)
      }
    })
  }

  it('map.annotation 闭包变化后，文本不能复用上一轮映射注释', async () => {
    let annotation = 'first.map'
    const annotate = vi.fn(() => annotation)
    const options = { from: 'input.css', to: 'output.css', map: { inline: false, annotation: annotate } }
    const { handler, onDiagnostic } = createHandler(options)
    const first = await handler(css)
    const calls = annotate.mock.calls.length
    annotation = 'second.map'
    const second = await handler(css)
    expect(second.css).toBe((await createHandler(options).handler(css)).css)
    expect(first.css).toContain('sourceMappingURL=first.map')
    expect(second.css).toContain('sourceMappingURL=second.map')
    expect(annotate.mock.calls.length).toBeGreaterThan(calls)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
  })

  it('syntax 对象的 parse 闭包每轮运行', async () => {
    let color = 'red'
    const parse = vi.fn<Parser>((source, options) => {
      const root = postcss.parse(source, options)
      root.walkDecls('color', (declaration) => {
        declaration.value = color
      })
      return root
    })
    const options = { syntax: { parse, stringify: postcss.stringify } }
    const { handler, onDiagnostic } = createHandler(options)
    const first = await handler(css)
    color = 'blue'
    const second = await handler(css)
    expect(second.css).toBe((await createHandler(options).handler(css)).css)
    expect(second.css).not.toBe(first.css)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
  })

  it('map.prev 闭包每轮提供本次来源映射', async () => {
    const temporary = await mkdtemp(path.join(tmpdir(), 'postcss-prev-callback-'))
    try {
      for (const name of ['first', 'second']) {
        await writeFile(path.join(temporary, `${name}.map`), JSON.stringify({
          version: 3,
          file: 'input.css',
          sources: [`${name}.css`],
          sourcesContent: [css],
          names: [],
          mappings: 'AAAA',
        }))
      }
      let source = path.join(temporary, 'first.map')
      const prev = vi.fn(() => source)
      const options = { from: 'input.css', to: 'output.css', map: { inline: false, annotation: false, prev } }
      const { handler, onDiagnostic } = createHandler(options)
      const first = await handler(css)
      source = path.join(temporary, 'second.map')
      const second = await handler(css)
      expect(second.map?.toJSON()).toEqual((await createHandler(options).handler(css)).map?.toJSON())
      expect(second.map?.toJSON().sources).not.toEqual(first.map?.toJSON().sources)
      expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    }
    finally {
      await rm(temporary, { recursive: true, force: true })
    }
  })

  it('map.prev 数组子类的继承 toJSON 状态变化后重新生成映射', async () => {
    let source = 'first.css'
    class Sources extends Array<string> {
      toJSON() {
        return [source]
      }
    }
    const options = {
      from: 'input.css',
      to: 'output.css',
      map: { inline: false, annotation: false, prev: {
        version: 3,
        file: 'input.css',
        sources: new Sources('stable.css'),
        sourcesContent: [css],
        names: [],
        mappings: 'AAAA',
      } },
    }
    const { handler, onDiagnostic } = createHandler(options)
    const first = await handler(css)
    source = 'second.css'
    const second = await handler(css)
    expect(second.map?.toJSON()).toEqual((await createHandler(options).handler(css)).map?.toJSON())
    expect(second.map?.toJSON().sources).not.toEqual(first.map?.toJSON().sources)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
  })

  it('自定义 parser 生成的新 AST 特征不能按原文本被裁掉', async () => {
    const modern = '.a{color:oklch(62.3% 0.214 259.815)}'
    const parser: Parser = (_source, options) => postcss.parse(modern, options)
    const handler = createHandler({ parser }).handler
    const expected = await createHandler().handler(modern)
    const result = await handler(css)
    expect(result.css).toBe(expected.css)
    expect(result.css).not.toContain('oklch')
  })

  it('不同不透明 syntax 实例不能被合并选项缓存替换为旧实例', async () => {
    const handler = createHandler().handler
    const first = { postcssOptions: { options: { syntax: new StatefulSyntax('red') } } }
    const second = { postcssOptions: { options: { syntax: new StatefulSyntax('blue') } } }
    const pipeline = handler.getPipeline(first)
    const initial = await handler(css, first)
    const current = await handler(css, second)
    expect(current.css).toBe((await createHandler().handler(css, second)).css)
    expect(current.css).not.toBe(initial.css)
    expect(current.css).toContain('color:blue')
    expect(handler.getPipeline(second)).toBe(pipeline)
  })

  it('同一处理选项原位替换不透明实例后返回本轮快照', () => {
    const cache = new StyleProcessorCache()
    const first = new StatefulSyntax('red')
    const second = new StatefulSyntax('blue')
    const options = { postcssOptions: { options: { syntax: first } } }
    const previous = cache.getProcessOptions(options)
    expect(previous.syntax).toBe(first)
    options.postcssOptions.options.syntax = second
    const current = cache.getProcessOptions(options)
    expect(current.syntax).toBe(second)
    expect(previous.syntax).toBe(first)
    expect(current).not.toBe(previous)
  })

  it('基线中的不透明配置变化后，局部覆盖也不能复用旧合并选项', () => {
    const first = new StatefulSyntax('red')
    const second = new StatefulSyntax('blue')
    const base = { postcssOptions: { options: { syntax: first } } }
    const resolver = createOptionsResolver(base)
    const overrides = { isMainChunk: false, postcssOptions: { options: { from: 'same.css' } } }
    const previous = resolver.resolve(overrides)
    expect(previous.postcssOptions?.options?.syntax).toBe(first)
    base.postcssOptions.options.syntax = second
    const current = resolver.resolve(overrides)
    expect(current.postcssOptions?.options?.syntax).toBe(second)
    expect(previous.postcssOptions?.options?.syntax).toBe(first)
  })

  it('默认处理与诊断回调仍保留文本和等价来源 Root 的缓存命中', async () => {
    const { handler, onDiagnostic } = createHandler()
    const first = await handler(css)
    expect((await handler(css)).css).toBe(first.css)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    const root = postcss.parse(css, { from: 'same.css', document: 'same document' })
    const firstRoot = await handler.transformRoot(root)
    const current = postcss.parse(css, { from: 'same.css', document: 'same document' })
    const secondRoot = await handler.transformRoot(current)
    expect(secondRoot.css).toBe(firstRoot.css)
    expect(secondRoot.root).not.toBe(firstRoot.root)
    expect(secondRoot.root.source?.input).toBe(current.source?.input)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
  })
})
