import type { IStyleHandlerOptions } from '../src/types'
import postcss from 'postcss'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as colorMix from '../src/compat/color-mix'
import { createStyleHandler } from '../src/handler'

afterEach(() => {
  vi.restoreAllMocks()
})
const source = ':root{--brand:red}.mix{background:color-mix(in srgb,var(--brand) 25%,transparent)}'

describe('缓存命中不重复执行确定性的输入准备', () => {
  it('文本缓存命中在color-mix资格解析前返回，变化输入仍重新分析', async () => {
    const protect = vi.spyOn(colorMix, 'protectDynamicColorMixAlpha')
    const handler = createStyleHandler({ majorVersion: 4, cssPreflight: false })
    const initial = await handler(source)
    const calls = protect.mock.calls.length
    expect(calls).toBeGreaterThan(0)
    for (let i = 0; i < 3; i++) {
      expect((await handler(source)).css).toBe(initial.css)
    }
    expect(protect).toHaveBeenCalledTimes(calls)
    const changed = await handler(source.replace('25%', '50%'))
    expect(protect.mock.calls.length).toBeGreaterThan(calls)
    expect(changed.css).not.toBe(initial.css)
  })

  it('Root缓存命中保留本轮源归属，不能重复准备或共享输出AST', async () => {
    const protect = vi.spyOn(colorMix, 'protectDynamicColorMixAlpha')
    const handler = createStyleHandler({ majorVersion: 4, cssPreflight: false })
    const first = await handler.transformRoot!(postcss.parse('.plain{width:1px}', { from: 'same.css' }))
    const calls = protect.mock.calls.length
    const input = postcss.parse('.plain{width:1px}', { from: 'same.css' })
    const second = await handler.transformRoot!(input)
    expect(second.css).toBe(first.css)
    expect(second.root).not.toBe(first.root)
    expect(second.root.source?.input).toBe(input.source?.input)
    expect(protect).toHaveBeenCalledTimes(calls)
  })

  it('作者插件每轮执行，不能用原始文本缓存跳过有副作用的用户阶段', async () => {
    let runs = 0
    const plugin = { postcssPlugin: 'unit-changing-author-stage', Once(root: postcss.Root) {
      runs++
      root.append({ selector: '.author', nodes: [{ prop: 'z-index', value: String(runs) }] })
    } }
    const handler = createStyleHandler({ majorVersion: 4, cssPreflight: false, postcssOptions: { plugins: [plugin] } })
    const first = await handler(source)
    const second = await handler(source)
    expect(runs).toBe(2)
    expect(first.css).toMatch(/z-index:\s*1/)
    expect(second.css).toMatch(/z-index:\s*2/)
  })

  it('输入未变但版本、平台或静态变量映射原位改变时仍重新准备', async () => {
    const protect = vi.spyOn(colorMix, 'protectDynamicColorMixAlpha')
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({ cssPreflight: false, onDiagnostic })
    const values = new Map([['--weight', '25%']])
    const options: Partial<IStyleHandlerOptions> = {
      majorVersion: 4,
      customPropertyCompatibilityValues: values,
    }
    const css = '.mix{color:color-mix(in srgb,red var(--weight),transparent)}'
    await handler(css, options)
    const initialCalls = protect.mock.calls.length
    await handler(css, options)
    expect(protect).toHaveBeenCalledTimes(initialCalls)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(true)
    for (const change of [
      () => { values.set('--weight', '50%') },
      () => { options.majorVersion = 3 },
      () => {
        options.majorVersion = 4
        options.uniAppX = true
      },
    ]) {
      change()
      const result = await handler(css, options)
      expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
      const fresh = await createStyleHandler({ cssPreflight: false })(css, options)
      expect(result.css).toBe(fresh.css)
    }
  })

  it('静态颜色预处理产生新Input时不能沿用上一轮合成来源', async () => {
    const protect = vi.spyOn(colorMix, 'protectDynamicColorMixAlpha')
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({ majorVersion: 4, cssPreflight: false, onDiagnostic })
    const css = '.mix{color:color-mix(in srgb,red 25%,transparent)}'
    const first = await handler.transformRoot!(postcss.parse(css, { from: 'same.css' }))
    const calls = protect.mock.calls.length
    const second = await handler.transformRoot!(postcss.parse(css, { from: 'same.css' }))
    expect(second.root.first?.source?.input).not.toBe(first.root.first?.source?.input)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
    expect(protect.mock.calls.length).toBeGreaterThan(calls)
    expect(second.root).not.toBe(first.root)
    expect(second.css).toBe(first.css)
    expect(second.css).not.toContain('color-mix')
    expect(second.css).not.toContain('__WEAPP')
  })

  it('已移除规则的warning不能沿用上一轮node来源', async () => {
    const onDiagnostic = vi.fn()
    const handler = createStyleHandler({
      cssPreflight: false,
      uniAppX: true,
      uniAppXCssTarget: 'uvue',
      uniAppXUnsupported: 'warn',
      onDiagnostic,
    })
    const first = await handler.transformRoot!(postcss.parse('.grid{display:grid}', { from: 'same.css' }))
    const second = await handler.transformRoot!(postcss.parse('.grid{display:grid}', { from: 'same.css' }))
    expect(first.warnings()).toHaveLength(1)
    expect(second.warnings()).toHaveLength(1)
    expect(second.warnings()[0]?.node?.source?.input).not.toBe(first.warnings()[0]?.node?.source?.input)
    expect(onDiagnostic.mock.calls.at(-1)?.[0].cache.hit).toBe(false)
  })
})
