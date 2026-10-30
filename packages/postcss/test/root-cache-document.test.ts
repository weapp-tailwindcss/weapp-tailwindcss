import type { Input, Root, Stringifier } from 'postcss'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { createStyleHandler } from '@/handler'
import { captureRootCacheSnapshot, cloneRootWithCurrentSources, matchRootCacheSnapshot } from '@/root-cache'

const css = '.a{color:red}'

function parseDocument(document: string) {
  return postcss.parse(css, { from: 'component.vue', document })
}

const printDocuments: Stringifier = (root, builder) => {
  const inputs = new Set<Input>()
  if (root.source) {
    inputs.add(root.source.input)
  }
  if (root.type === 'root' || root.type === 'document') {
    root.walk((node) => {
      if (node.source) {
        inputs.add(node.source.input)
      }
    })
  }
  builder(`/* ${[...inputs].map(input => input.document).join(' | ')} */`)
  postcss.stringify(root, builder)
}

function createHandler(stringifier: Stringifier = printDocuments) {
  const onDiagnostic = vi.fn()
  const handler = createStyleHandler({
    cssPreflight: false,
    onDiagnostic,
    postcssOptions: { options: { stringifier } },
  })
  return { handler, onDiagnostic }
}

describe('Root 缓存中的完整来源文档身份', () => {
  it('默认序列化仍按完整文档失效，并保留新来源的等价命中', async () => {
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({ cssPreflight: false, onDiagnostic })
    const first = await handler.transformRoot(parseDocument('first document'))
    const current = parseDocument('second document')
    const second = await handler.transformRoot(current)
    expect(second.css).toBe(first.css)
    expect(second.root.source?.input).toBe(current.source?.input)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    const input = current.source?.input
    if (!input) {
      throw new Error('Expected a parsed Input')
    }
    input.document = 'third document'
    const third = await handler.transformRoot(current)
    expect(third.root.source?.input).toBe(input)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    const equivalent = parseDocument('third document')
    const last = await handler.transformRoot(equivalent)
    expect(last.css).toBe(third.css)
    expect(last.root).not.toBe(third.root)
    expect(last.root.source?.input).toBe(equivalent.source?.input)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
  })

  it('CSS、文件和位置相同，完整文档不同仍重新序列化', async () => {
    const { handler, onDiagnostic } = createHandler()
    const first = await handler.transformRoot(parseDocument('<style id="first">.a{color:red}</style>'))
    const current = parseDocument('<style id="current">.a{color:red}</style>')
    const second = await handler.transformRoot(current)
    const fresh = await createHandler().handler.transformRoot(current)

    expect(second.css).toBe(fresh.css)
    expect(second.css).not.toBe(first.css)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    expect(second.root.source?.input).toBe(current.source?.input)
  })

  it('同一 Input 原位更改文档也不复用旧序列化结果', async () => {
    const { handler, onDiagnostic } = createHandler()
    const current = parseDocument('first document')
    const input = current.source?.input
    if (!input) {
      throw new Error('Expected a parsed Input')
    }
    const first = await handler.transformRoot(current)
    input.document = 'updated document'
    const second = await handler.transformRoot(current)

    expect(second.css).toBe((await createHandler().handler.transformRoot(current)).css)
    expect(second.css).not.toBe(first.css)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    expect(second.root.source?.input).toBe(input)
  })

  it('第二个 Input 的文档也参与缓存资格判断', async () => {
    const makeRoot = (document: string): Root => {
      const root = parseDocument('unchanged first document')
      root.append(postcss.parse('.b{color:blue}', { from: 'second.vue', document }).nodes)
      return root
    }
    const { handler, onDiagnostic } = createHandler()
    const first = await handler.transformRoot(makeRoot('first revision of second document'))
    const current = makeRoot('second revision of second document')
    const second = await handler.transformRoot(current)

    expect(second.css).toBe((await createHandler().handler.transformRoot(current)).css)
    expect(second.css).not.toBe(first.css)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    expect(second.root.last?.source?.input).toBe(current.last?.source?.input)
  })

  it('等价文档的自定义 stringifier 仍逐次执行并保留输出隔离', async () => {
    const stringifier = vi.fn(printDocuments)
    const { handler, onDiagnostic } = createHandler(stringifier)
    const first = await handler.transformRoot(parseDocument('same document'))
    const calls = stringifier.mock.calls.length
    const oldInput = first.root.first?.source?.input
    const current = parseDocument('same document')
    const second = await handler.transformRoot(current)

    expect(second.css).toBe(first.css)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    expect(stringifier.mock.calls.length).toBeGreaterThan(calls)
    expect(second.root).not.toBe(first.root)
    expect(second.root.first?.source?.input).toBe(current.first?.source?.input)
    expect(first.root.first?.source?.input).toBe(oldInput)
    expect(first.root.first?.source?.input).not.toBe(second.root.first?.source?.input)
  })

  it('文档快照按值捕获，恢复原文后可重新匹配并绑定多个 Input', () => {
    const root = parseDocument('first document')
    root.append(postcss.parse('.b{color:blue}', { from: 'second.vue', document: 'second document' }).nodes)
    const snapshot = captureRootCacheSnapshot(root)
    const input = root.last?.source?.input
    if (!input) {
      throw new Error('Expected the second Input')
    }
    input.document = 'changed second document'
    expect(matchRootCacheSnapshot(snapshot, root)).toBeUndefined()
    input.document = 'second document'
    expect(matchRootCacheSnapshot(snapshot, root)?.size).toBe(0)

    const current = parseDocument('first document')
    current.append(postcss.parse('.b{color:blue}', { from: 'second.vue', document: 'second document' }).nodes)
    const bindings = matchRootCacheSnapshot(snapshot, current)
    expect(bindings?.size).toBe(2)
    const clone = cloneRootWithCurrentSources(root, bindings)
    expect(clone.first?.source?.input).toBe(current.first?.source?.input)
    expect(clone.last?.source?.input).toBe(current.last?.source?.input)
    expect(root.last?.source?.input).toBe(input)
  })
})
