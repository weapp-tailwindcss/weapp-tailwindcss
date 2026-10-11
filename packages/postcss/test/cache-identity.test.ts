import type { Plugin } from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { fingerprintOptions } from '@/fingerprint'
import { createStyleHandler } from '@/handler'
import cssMacroPlugin from '@/css-macro/postcss'
import { contentHash } from '@/utils/content-hash'

function colorPlugin(color: () => string): Plugin {
  return {
    postcssPlugin: 'test-color',
    Once(root) {
      root.walkDecls('color', declaration => { declaration.value = color() })
    },
  }
}

describe('样式缓存输入身份', () => {
  it('包内纯 CSS macro 可以复用结果，但同名外部插件不继承此策略', async () => {
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({ cssPreflight: false, onDiagnostic })
    const css = '.a{color:red}'
    await handler(css, { postcssOptions: { plugins: [cssMacroPlugin()] } })
    await handler(css, { postcssOptions: { plugins: [cssMacroPlugin()] } })
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    let visits = 0
    const external = { postcssPlugin: 'postcss-weapp-tw-css-macro-plugin', Once() { visits++ } }
    await handler(css, { postcssOptions: { plugins: [external] } })
    await handler(css, { postcssOptions: { plugins: [external] } })
    expect(visits).toBe(2)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    const extended = { ...cssMacroPlugin(), Once() { visits++ } }
    await handler(css, { postcssOptions: { plugins: [extended] } })
    await handler(css, { postcssOptions: { plugins: [extended] } })
    expect(visits).toBe(4)
  })
  it('用户阶段逐次执行，缓存平台结果不复用上轮依赖消息', async () => {
    let calls = 0
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({
      cssPreflight: false,
      onDiagnostic,
      postcssOptions: { plugins: [{
        postcssPlugin: 'external-state',
        OnceExit(_root, { result }) {
          calls++
          result.messages.push({ type: 'dependency', plugin: 'external-state', file: `dependency-${calls}.css` })
        },
      }] },
    })
    const first = await handler('.a{color:red}')
    const second = await handler('.a{color:red}')
    expect(calls).toBe(2)
    expect(second.css).toBe(first.css)
    expect(second).not.toBe(first)
    expect(second.messages.filter(message => message.type === 'dependency')).toEqual([
      { type: 'dependency', plugin: 'external-state', file: 'dependency-2.css' },
    ])
    expect(onDiagnostic).toHaveBeenCalledTimes(2)
    expect(onDiagnostic.mock.calls.every(([event]) => event.cache.hit === false)).toBe(true)
  })

  it('用户阶段错误上报后允许下一次调用重试', async () => {
    let fail = true
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({ cssPreflight: false, onDiagnostic, postcssOptions: { plugins: [{
      postcssPlugin: 'retry-user-stage',
      Once() {
        if (fail) {
          fail = false
          throw new Error('retry')
        }
      },
    }] } })
    await expect(handler('.a{color:red}')).rejects.toThrow('retry')
    expect(onDiagnostic.mock.calls[0]?.[0].error.message).toBe('retry')
    expect((await handler('.a{color:red}')).css).toContain('color:red')
  })
  it('不同内容即使短哈希碰撞也不能复用结果', async () => {
    const first = '.x{z-index:661068122}'
    const second = '.x{z-index:1817992289}'
    expect(contentHash(first)).toBe(contentHash(second))
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({ cssPreflight: false, isMainChunk: false, onDiagnostic })
    for (const source of [first, second, first]) {
      expect((await handler(source)).css).toBe(source)
      expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    }
    expect((await handler(first)).css).toBe(first)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
  })

  it.each([['', 0x811C9DC5], ['a', 0xE40C292C], ['hello', 0x4F9F2CAB]])('32 位哈希遵守已知 FNV-1a 向量：%s', (source, expected) => {
    expect(contentHash(source)).toBe(expected.toString(36))
  })

  it('区分同名闭包并稳定识别同一函数', () => {
    const first = colorPlugin(() => 'red')
    const second = colorPlugin(() => 'blue')
    expect(fingerprintOptions(first)).toBe(fingerprintOptions(first))
    expect(fingerprintOptions(first)).not.toBe(fingerprintOptions(second))
  })

  it('调用级插件替换后采用新闭包', async () => {
    const handler = createStyleHandler({ cssPreflight: false, isMainChunk: false })
    const run = (color: string) => handler('.x{color:black}', {
      postcssOptions: { plugins: [colorPlugin(() => color)] },
    })
    expect((await run('red')).css).toContain('color:red')
    expect((await run('blue')).css).toContain('color:blue')
  })

  it('同一插件依赖的外部状态变化后重新执行', async () => {
    let color = 'red'
    const handler = createStyleHandler({
      cssPreflight: false,
      isMainChunk: false,
      postcssOptions: { plugins: [colorPlugin(() => color)] },
    })
    expect((await handler('.x{color:black}')).css).toContain('color:red')
    color = 'blue'
    expect((await handler('.x{color:black}')).css).toContain('color:blue')
  })

  it('保护占位内容一致时仍按原始输入区分动态变量', async () => {
    const handler = createStyleHandler({ appType: 'uni-app-x', majorVersion: 4, cssPreflight: false, isMainChunk: false })
    const first = '.x{width:var(--author-a, 10px)}'
    const second = '.x{width:var(--author-b, 20px)}'
    expect((await handler(first)).css).toContain('--author-a')
    expect((await handler(second)).css).toContain('--author-b')
  })
})
