import { describe, expect, it } from 'vitest'
import { postcss } from '@/index'
import { captureRootCacheSnapshot, cloneRootWithCurrentSources, matchRootCacheSnapshot } from '@/root-cache'

describe('Root 缓存快照', () => {
  it('复用多个等价输入时逐一重新绑定来源，且不修改缓存产物', () => {
    const create = () => {
      const root = postcss.parse('.a{color:red}', { from: 'a.css' })
      root.append(postcss.parse('.b{color:blue}', { from: 'b.css' }).nodes)
      return root
    }
    const previous = create()
    const snapshot = captureRootCacheSnapshot(previous)
    const current = create()
    const bindings = matchRootCacheSnapshot(snapshot, current)
    expect(bindings?.size).toBe(2)
    const result = cloneRootWithCurrentSources(previous, bindings)
    expect(result.first?.source?.input).toBe(current.first?.source?.input)
    expect(result.last?.source?.input).toBe(current.last?.source?.input)
    expect(previous.first?.source?.input).not.toBe(current.first?.source?.input)
  })

  it('同一个 Input 的 CSS 或 source map 原地修改也使旧快照失效', () => {
    const root = postcss.parse('.a{color:red}', {
      from: 'generated.css',
      map: { prev: { version: 3, sources: ['author.css'], names: [], mappings: 'AAAA', sourcesContent: ['.a{color:red}'] } },
    })
    const snapshot = captureRootCacheSnapshot(root)
    const input = root.source!.input
    const css = input.css
    input.css = '.b{color:red}'
    expect(matchRootCacheSnapshot(snapshot, root)).toBeUndefined()
    input.css = css
    expect(matchRootCacheSnapshot(snapshot, root)).toBeDefined()
    input.map!.text = JSON.stringify({ version: 3, sources: ['different.css'], names: [], mappings: 'AAAA' })
    expect(matchRootCacheSnapshot(snapshot, root)).toBeUndefined()
  })

  it('相同节点顺序不能掩盖容器结构变化', () => {
    const container = postcss.atRule({ name: 'media', params: 'screen', nodes: [] })
    const root = postcss.root({ nodes: [container, postcss.rule({ selector: '.a', nodes: [] })] })
    const snapshot = captureRootCacheSnapshot(root)
    const rule = root.last!
    rule.remove()
    container.append(rule)
    expect(matchRootCacheSnapshot(snapshot, root)).toBeUndefined()
  })

  it.each(['/workspace/styles.css', 'C:\\workspace\\styles.css', '\\styles.css', 'styles.css'])('按原始来源身份比较 %s', (file) => {
    const previous = postcss.parse('.a{color:red}')
    previous.source!.input.file = file
    const snapshot = captureRootCacheSnapshot(previous)
    const current = postcss.parse('.a{color:red}')
    current.source!.input.file = file
    expect(matchRootCacheSnapshot(snapshot, current)?.get(previous.source!.input)).toBe(current.source!.input)
    current.source!.input.file = `${file}.other`
    expect(matchRootCacheSnapshot(snapshot, current)).toBeUndefined()
  })

  it('保留扩展元数据的值与函数身份，忽略遍历过程状态', () => {
    const root = postcss.parse('.a{color:red}')
    const metadata = { revision: 1, callback: () => 'first' }
    Object.assign(root, { metadata })
    const snapshot = captureRootCacheSnapshot(root)
    root.walk(() => {})
    expect(matchRootCacheSnapshot(snapshot, root)).toBeDefined()
    metadata.revision++
    expect(matchRootCacheSnapshot(snapshot, root)).toBeUndefined()
    metadata.revision--
    metadata.callback = () => 'second'
    expect(matchRootCacheSnapshot(snapshot, root)).toBeUndefined()
  })

  it('raws 与新增或删除的扩展字段不能漏检', () => {
    const root = postcss.parse('.a{color:red}')
    const snapshot = captureRootCacheSnapshot(root)
    root.first!.raws.before = '\n'
    expect(matchRootCacheSnapshot(snapshot, root)).toBeUndefined()
    root.first!.raws.before = ''
    expect(matchRootCacheSnapshot(snapshot, root)).toBeDefined()
    Object.assign(root, { revision: undefined })
    expect(matchRootCacheSnapshot(snapshot, root)).toBeUndefined()
  })
})
