import type { IStyleHandlerOptions } from '../src/types'
import postcss from 'postcss'
import { describe, expect, it } from 'vitest'
import { postprocessUniAppXUvueCss } from '../src/branches/uni-app-x-css-uvue'
import { postprocessUniAppXWebviewCss } from '../src/branches/uni-app-x-css-webview'
import { applyUniAppXBaseCompatibility } from '../src/compat/uni-app-x'

async function reportedResult(css = '*{--tw-scale-x:1}.a{transform:scaleX(var(--tw-scale-x))}') {
  return postcss([{
    postcssPlugin: 'base-message-source',
    Once(root, { result }) {
      result.messages.push({ type: 'dependency', plugin: 'base-message-source', file: 'theme.css' })
      root.first?.warn(result, 'carrier warning')
      result.messages.push({ type: 'dir-dependency', plugin: 'base-message-source', dir: 'tokens', glob: '*.css' })
    },
  }]).process(css, { from: 'input.css', map: { inline: false, annotation: false } })
}

describe('uni-app x base 后处理消息交接', () => {
  it('重建 CSS 后保留消息顺序、身份及已删除 carrier 的警告来源', async () => {
    const initial = await reportedResult()
    const messages = [...initial.messages]
    const carrier = initial.root.first
    const rule = initial.root.last
    const input = rule?.source?.input
    const result = applyUniAppXBaseCompatibility(initial, { uniAppX: true })

    expect(result.css).toBe('.a{--tw-scale-x:1;transform:scaleX(var(--tw-scale-x))}')
    expect(result.root).toBe(initial.root)
    expect(result.root.first).toBe(rule)
    expect(rule?.source?.input).toBe(input)
    expect(carrier?.parent).toBeUndefined()
    expect(result.messages).toEqual(messages)
    result.messages.forEach((message, index) => expect(message).toBe(messages[index]))
    expect(result.messages).not.toBe(initial.messages)
    expect(result.warnings()[0]?.node).toBe(carrier)
    expect(result.warnings()[0]?.node?.source?.input).toBe(input)
    const output = new postcss.Input(result.css, { map: { prev: result.map.toString() } })
    const origin = output.origin(1, 1)
    expect(origin && origin.file).toBe(input?.file)
    result.messages.pop()
    expect(initial.messages).toEqual(messages)
  })

  it('Document 重建仍保留原消息及容器来源', async () => {
    const first = postcss.parse('*{--tw-scale-x:1}.a{transform:scaleX(var(--tw-scale-x))}', { from: 'first.css' })
    const second = postcss.parse('.b{color:red}', { from: 'second.css' })
    const document = postcss.document({ nodes: [first, second] })
    const initial = document.toResult({ map: { inline: false, annotation: false } })
    const dependency = { type: 'dependency', plugin: 'author', file: 'theme.css' }
    initial.messages.push(dependency)
    first.first?.warn(initial, 'document carrier warning')
    const messages = [...initial.messages]
    const result = applyUniAppXBaseCompatibility(initial, { uniAppX: true })

    expect(result.root).toBe(document)
    expect(document.nodes).toEqual([first, second])
    expect(result.messages).toEqual(messages)
    expect(result.messages[0]).toBe(dependency)
    expect(result.warnings()[0]).toBe(initial.warnings()[0])
    expect(result.map.toJSON().sources).toEqual(['first.css', '<no source>', 'second.css'])
    const output = new postcss.Input(result.css, { map: { prev: result.map.toString() } })
    const origin = output.origin(1, result.css.indexOf('.b') + 1)
    expect(origin && origin.file).toBe(second.source?.input.file)
  })

  it('WebView 分支返回平台阶段已有的依赖和警告', async () => {
    const initial = await reportedResult()
    const messages = [...initial.messages]
    const options: IStyleHandlerOptions = { uniAppX: true }
    const result = postprocessUniAppXWebviewCss(initial, options)

    expect(result.messages).toEqual(messages)
    expect(result.warnings()[0]).toBe(initial.warnings()[0])
    expect(result.css).toContain('--tw-scale-x:1')
  })

  it('UVUE 分支先保留原消息，再追加本轮兼容警告', async () => {
    const initial = await reportedResult('*{--tw-scale-x:1}.a{transform:scaleX(var(--tw-scale-x));display:grid}')
    const messages = [...initial.messages]
    const options: IStyleHandlerOptions = { uniAppX: true, uniAppXCssTarget: 'uvue' }
    const result = postprocessUniAppXUvueCss(initial, options)

    expect(result.messages.slice(0, messages.length)).toEqual(messages)
    result.messages.slice(0, messages.length).forEach((message, index) => expect(message).toBe(messages[index]))
    expect(result.warnings()).toHaveLength(2)
    expect(result.warnings()[0]).toBe(initial.warnings()[0])
    expect(result.warnings()[1]?.text).toContain('display: grid')
    expect(result.css).not.toContain('display:grid')
  })

  it('再次兼容处理不重复已有消息', async () => {
    const initial = await reportedResult()
    const first = applyUniAppXBaseCompatibility(initial, { uniAppX: true })
    const messages = [...first.messages]
    const second = applyUniAppXBaseCompatibility(first, { uniAppX: true })

    expect(second).toBe(first)
    expect(second.messages).toEqual(messages)
    expect(second.messages).toHaveLength(3)
  })

  it('禁用兼容时仍返回原 Result', async () => {
    const initial = await reportedResult()
    expect(applyUniAppXBaseCompatibility(initial, { uniAppX: false })).toBe(initial)
    expect(initial.messages).toHaveLength(3)
  })

  it('没有默认变量时仍返回原 Result 和消息数组', async () => {
    const initial = await reportedResult('.a{color:red}')
    expect(applyUniAppXBaseCompatibility(initial, { uniAppX: true })).toBe(initial)
    expect(initial.messages).toHaveLength(3)
  })
})
