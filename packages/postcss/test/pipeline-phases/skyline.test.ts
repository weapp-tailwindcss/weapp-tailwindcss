import type { Input, Plugin, ProcessOptions, Result } from 'postcss'
import postcss from 'postcss'
import { describe, expect, it, vi } from 'vitest'
import { SKYLINE_INVALID_RESET_PROPERTY } from '@/compat/tailwindcss-v4/skyline-typography'
import cssMacro from '@/css-macro/postcss'
import { createStyleHandler } from '@/handler'
import { createStylePipeline } from '@/pipeline'
import { options } from './helpers'

const reset = /--tw-leading:\s*var\(--weapp-tw-invalid-reset\)/

describe('Skyline 与真实作者平台阶段的组合', () => {
  it('替换 Root 的作者完整序列化后才 prepare preset，并保留选项、来源、消息与 Skyline reset', async () => {
    const events: string[] = []
    const original = postcss.parse('.original{width:1px}', { from: 'original.css' })
    const replacement = postcss.parse('@custom-media --wide (width >= 30em);.authored{--tw-leading:initial;line-height:var(--tw-leading,32px);width:calc(2px + 3px)}@media (--wide){.authored{color:blue}}', { from: 'replacement.css' })
    const input = replacement.source?.input
    const originalFirst = original.first
    const replacementFirst = replacement.first
    if (!input || !originalFirst || !replacementFirst) {
      throw new Error('Expected source-bearing roots')
    }
    const warning = new postcss.Warning('author warning', { plugin: 'author', node: originalFirst })
    const late = { type: 'late', plugin: 'author', node: replacementFirst }
    const processOptions: ProcessOptions = { from: 'outer.css', to: 'outer.out.css', map: { inline: false, annotation: false } }
    let authorResult: Result | undefined
    const author: Plugin = {
      postcssPlugin: 'skyline-author',
      prepare(result) {
        authorResult = result
        expect(result.opts.map).toBe(false)
        return { OnceExit(_root, { result }) {
          events.push('author-exit')
          result.root = replacement
          result.messages.push(warning)
        } }
      },
    }
    const insertion: Plugin = {
      postcssPlugin: 'skyline-preset-observer',
      prepare(result) {
        events.push('preset-prepare')
        expect(events).toEqual(['author-exit', 'author-serialize', 'preset-prepare'])
        expect(result.root).toBe(replacement)
        expect(result.root.source?.input).toBe(input)
        expect(result.opts).toBe(processOptions)
        expect(result.messages).not.toBe(authorResult?.messages)
        expect(result.messages[0]).toBe(warning)
        expect(result.messages[1]).toBe(late)
        return {}
      },
    }
    processOptions.stringifier = (root, builder) => {
      if (!events.includes('preset-prepare')) {
        events.push('author-serialize')
        authorResult?.messages.push(late)
      }
      postcss.stringify(root, builder)
    }
    const pipeline = createStylePipeline(options({
      majorVersion: 4,
      platform: 'mp-weixin',
      cssOptions: { skyline: true },
      postcssOptions: { plugins: [author] },
      cssPresetEnv: { stage: false, autoprefixer: false, features: { 'custom-media-queries': true }, insertBefore: { 'custom-media-queries': insertion } },
    }))
    expect(pipeline.kind).toBe('phased')
    const result = await pipeline.process(original, processOptions)
    expect(result.root).toBe(replacement)
    expect(result.root.source?.input).toBe(input)
    expect(result.messages[0]).toBe(warning)
    expect(result.messages[1]).toBe(late)
    expect(result.css).toContain('30em')
    expect(result.css).toContain('width:5px')
    expect(result.css).toMatch(reset)
    expect(original.toString()).toBe('.original{width:1px}')
    events.length = 0
    replacement.append(postcss.rule({ selector: '.invalid', nodes: [postcss.decl({ prop: SKYLINE_INVALID_RESET_PROPERTY, value: '1' })] }))
    await expect(pipeline.process(original, processOptions)).rejects.toThrow('保留变量')
  })

  it('handler 的已登记 macro 仍走实际 phased，并在 preset prepare 前完成宏与 Skyline 输入校验', async () => {
    let observedRoot: Result['root'] | undefined
    let observedInput: Input | undefined
    let observedOptions: ProcessOptions | undefined
    const insertion: Plugin = {
      postcssPlugin: 'macro-skyline-preset-observer',
      prepare: vi.fn((result: Result) => {
        observedRoot = result.root
        observedInput = result.root.source?.input
        observedOptions = result.opts
        expect(result.root.toString()).toContain('#ifdef MP-WEIXIN')
        expect(result.root.toString()).not.toContain('@weapp-tw-ifdef')
        return {}
      }),
    }
    const handler = createStyleHandler(options({
      majorVersion: 4,
      platform: 'mp-weixin',
      cssOptions: { skyline: true },
      postcssOptions: { plugins: [cssMacro()], options: { from: 'macro.css' } },
      cssPresetEnv: { stage: false, autoprefixer: false, features: { 'custom-media-queries': true }, insertBefore: { 'custom-media-queries': insertion } },
    }))
    const pipeline = handler.getPipeline()
    expect(pipeline.kind).toBe('phased')
    const execute = vi.spyOn(pipeline, 'process')
    try {
      const source = '@custom-media --wide (width >= 30em);@weapp-tw-ifdef MP-WEIXIN{.macro{--tw-leading:initial;line-height:var(--tw-leading,32px);width:calc(1px + 2px)}}@media (--wide){.wide{color:blue}}'
      const result = await handler(source)
      expect(execute).toHaveBeenCalledTimes(1)
      expect(insertion.prepare).toHaveBeenCalledTimes(1)
      expect(observedOptions).toBe(execute.mock.calls[0]?.[1])
      expect(result.root).toBe(observedRoot)
      expect(result.root.source?.input).toBe(observedInput)
      expect(result.css).toContain('#ifdef MP-WEIXIN')
      expect(result.css).toContain('width:3px')
      expect(result.css).toContain('30em')
      expect(result.css).toMatch(reset)
      await expect(async () => handler(`${source}.invalid{${SKYLINE_INVALID_RESET_PROPERTY}:1}`)).rejects.toThrow('保留变量')
      expect(execute).toHaveBeenCalledTimes(1)
      expect(insertion.prepare).toHaveBeenCalledTimes(1)
    }
    finally {
      execute.mockRestore()
    }
  })
})
