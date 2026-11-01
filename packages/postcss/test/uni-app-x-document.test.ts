import { describe, expect, it } from 'vitest'
import { applyUniAppXUvueCompatibility } from '@/compat/uni-app-x-uvue'
import { postcss } from '@/index'

const options = { uniAppX: true, uniAppXCssTarget: 'uvue' as const }

describe('UVUE 多文档兼容边界', () => {
  it('逐 Root 解析主题并保留容器、节点和多个 Input 来源', () => {
    const first = postcss.parse(':root{--size:2px}.first{width:calc(var(--size) * 3)}', { from: 'first.css' })
    const second = postcss.parse(':root{--size:5px}.second{width:calc(var(--size) * 3)}', { from: 'second.css' })
    const firstRule = first.last
    const secondRule = second.last
    const firstInput = firstRule?.source?.input
    const secondInput = secondRule?.source?.input
    const document = postcss.document({ nodes: [first, second] })
    const result = applyUniAppXUvueCompatibility(document.toResult({ map: { inline: false, annotation: false } }), options)

    expect(result.root).toBe(document)
    expect(document.nodes).toEqual([first, second])
    expect(first.first).toBe(firstRule)
    expect(second.first).toBe(secondRule)
    expect(firstRule?.source?.input).toBe(firstInput)
    expect(secondRule?.source?.input).toBe(secondInput)
    expect(first.toString()).toBe('.first{width:6px}')
    expect(second.toString()).toBe('.second{width:15px}')
    const map = result.map.toJSON()
    expect(map.sources).toEqual(['first.css', 'second.css'])
    const mappedInput = new postcss.Input(result.css, { map: { prev: result.map.toString() } })
    const secondColumn = result.css.indexOf('.second')
    expect(mappedInput.origin(1, 1)).toMatchObject({ file: firstInput?.file })
    expect(mappedInput.origin(1, secondColumn + 1)).toMatchObject({ file: secondInput?.file })
  })

  it('未声明的变量不借用另一 Root 的主题值', () => {
    const first = postcss.parse(':root{--size:2px}.first{width:var(--size)}')
    const second = postcss.parse('.second{width:var(--size)}')
    const document = postcss.document({ nodes: [first, second] })
    const configured = new Map([['--size', '7px']])
    applyUniAppXUvueCompatibility(document.toResult(), { ...options, customPropertyValues: configured })

    expect(first.toString()).toBe('.first{width:2px}')
    expect(second.toString()).toBe('.second{width:7px}')
    expect([...configured]).toEqual([['--size', '7px']])
  })

  it('SFC 来源和 banner 不跨 Root 放行全局选择器', () => {
    const first = postcss.parse('/*! tailwindcss v4.3.2 */button{color:red}', {
      from: 'Scoped.uvue?vue&type=style&index=0',
    })
    const second = postcss.parse('button{color:blue}', { from: 'global.css' })
    const badRule = second.first
    const document = postcss.document({ nodes: [first, second] })
    const initial = document.toResult()
    const authorMessage = { type: 'dependency', plugin: 'author', file: 'original.css' }
    initial.messages.push(authorMessage)
    const result = applyUniAppXUvueCompatibility(initial, options)

    expect(first.toString()).toBe('button{color:red}')
    expect(second.toString()).toBe('')
    expect(result.messages[0]).toBe(authorMessage)
    expect(result.warnings()).toHaveLength(1)
    expect(result.warnings()[0]?.node).toBe(badRule)
    expect(result.warnings()[0]?.text).toContain('global.css')
  })

  it('Document 的聚合 from 不覆盖独立 Root 的真实来源', () => {
    const first = postcss.parse('button{color:red}', { from: 'Scoped.uvue?vue&type=style&index=0' })
    const second = postcss.parse('button{color:blue}', { from: 'global.css' })
    const document = postcss.document({ nodes: [first, second] })
    const result = applyUniAppXUvueCompatibility(document.toResult({
      from: 'Scoped.uvue?vue&type=style&index=0',
    }), options)

    expect(first.toString()).toBe('button{color:red}')
    expect(second.toString()).toBe('')
    expect(result.warnings()[0]?.text).toContain('global.css')
  })

  it('插件新建无来源规则仍消费所属 Root 自身的 SFC 来源', () => {
    const root = postcss.parse('', { from: 'Scoped.uvue?vue&type=style&index=0' })
    const rule = postcss.rule({ selector: 'button', nodes: [postcss.decl({ prop: 'color', value: 'red' })] })
    root.append(rule)
    const document = postcss.document({ nodes: [root] })
    const result = applyUniAppXUvueCompatibility(document.toResult(), options)

    expect(rule.source).toBeUndefined()
    expect(root.first).toBe(rule)
    expect(result.css).toBe('button {\n    color: red\n}')
    expect(result.warnings()).toEqual([])
  })

  it('原消息、过滤警告和 calc 警告分别保留 Root 顺序及节点来源', () => {
    const first = postcss.parse('.first{width:calc(500px / 0)}', { from: 'first.css' })
    const second = postcss.parse('.second{width:calc(600px / 0)}', { from: 'second.css' })
    const firstDecl = first.first?.type === 'rule' ? first.first.first : undefined
    const secondDecl = second.first?.type === 'rule' ? second.first.first : undefined
    const document = postcss.document({ nodes: [first, second] })
    const initial = document.toResult()
    const prefix = { type: 'dependency', plugin: 'author', file: 'input.css' }
    initial.messages.push(prefix)
    const result = applyUniAppXUvueCompatibility(initial, options)
    const warnings = result.warnings()

    expect(result.messages[0]).toBe(prefix)
    expect(warnings.map(warning => warning.text)).toEqual([
      expect.stringContaining('first ('),
      expect.stringContaining('second ('),
      expect.stringContaining('Cannot divide by zero'),
      expect.stringContaining('Cannot divide by zero'),
    ])
    expect(warnings.slice(2).map(warning => warning.node)).toEqual([firstDecl, secondDecl])
    expect(warnings.map(warning => warning.node?.source?.input.file)).toEqual([
      first.source?.input.file,
      second.source?.input.file,
      first.source?.input.file,
      second.source?.input.file,
    ])
  })

  it('按 Root 顺序保留警告和被删除节点的来源', () => {
    const first = postcss.parse('.first{display:grid}', { from: 'first.css' })
    const second = postcss.parse('.second{display:grid}', { from: 'second.css' })
    const document = postcss.document({ nodes: [first, second] })
    const result = applyUniAppXUvueCompatibility(document.toResult(), options)

    expect(result.warnings().map(warning => warning.node?.source?.input.file)).toEqual([
      first.source?.input.file,
      second.source?.input.file,
    ])
    expect(document.nodes).toEqual([first, second])
    expect(result.css).toBe('')
  })

  it('兄弟 SFC 的 banner 不作为本 Root 删除作者 reset 的依据', () => {
    const first = postcss.parse('/*! tailwindcss v4.3.2 */button[data-v-a]{font:inherit}')
    const second = postcss.parse('button[data-v-b]{font:inherit}')
    const document = postcss.document({ nodes: [first, second] })
    applyUniAppXUvueCompatibility(document.toResult(), options)

    expect(first.toString()).toBe('')
    expect(second.toString()).toBe('button[data-v-b]{font:inherit}')
  })

  it('空 Document 和非 UVUE 结果保持原边界', () => {
    const document = postcss.document()
    expect(applyUniAppXUvueCompatibility(document.toResult(), options).root).toBe(document)
    const initial = postcss.document({ nodes: [postcss.parse('button{display:grid}')] }).toResult()
    expect(applyUniAppXUvueCompatibility(initial, { uniAppX: true })).toBe(initial)
    expect(initial.css).toBe('button{display:grid}')
  })
})
