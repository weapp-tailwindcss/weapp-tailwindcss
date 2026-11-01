import type { AcceptedPlugin, Plugin, ProcessOptions, Result } from 'postcss'
import type { PipelineControl } from './types'
import postcss from 'postcss'

/** 作者实例按计划归一化一次，捕获每个真实 Result 的原生选项。 */
export function createAuthorStage(plugins: AcceptedPlugin[]) {
  const processor = postcss(plugins)
  const capturedOptions = new WeakMap<Result, ProcessOptions>()
  const enabled = processor.plugins.length > 0
  const capture: Plugin = {
    postcssPlugin: 'weapp-tailwindcss-author-options',
    prepare(result) {
      const original = result.opts
      capturedOptions.set(result, original)
      result.opts = { ...original, map: false }
      return {}
    },
  }
  const control: PipelineControl = { postcssPlugin: capture.postcssPlugin, phase: 'author', hook: 'prepare', position: 'first' }
  if (enabled) {
    processor.plugins.unshift(capture)
  }
  return {
    control: enabled ? control : undefined,
    processor,
    enabled,
    getOptions(result: Result) {
      const options = capturedOptions.get(result)
      if (!options) {
        throw new Error('Missing author phase process options.')
      }
      return options
    },
  }
}

export type AuthorStage = ReturnType<typeof createAuthorStage>
