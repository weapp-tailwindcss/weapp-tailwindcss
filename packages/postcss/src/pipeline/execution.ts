import type { AcceptedPlugin, ProcessOptions, Result } from 'postcss'
import type { IStyleHandlerOptions } from '../types'
import type { AuthorStage } from './author'
import type { PipelineControl, PipelineNodeContext, PipelineNodeCursor, StylePipelineInput } from './types'
import postcss from 'postcss'
import { createContext } from '../plugins/ctx'
import { markSelectorTransformOptionsStable } from '../selectorParser/rule-transformer/options'

export interface PreparedPipelineNode extends PipelineNodeCursor {
  createPlugin: (context: PipelineNodeContext, options: IStyleHandlerOptions) => AcceptedPlugin
  fresh?: boolean
}

/** 同一实际配方驱动描述和执行；保留第三方实例，只重建库拥有的运行状态。 */
export function createPhasedExecutor(
  options: IStyleHandlerOptions,
  author: AuthorStage,
  nodes: PreparedPipelineNode[],
  contexts: PipelineNodeContext[],
) {
  const recipe = nodes.map((node, index) => {
    const context = contexts[index]!
    return node.fresh
      ? { create: (runOptions: IStyleHandlerOptions) => node.createPlugin(context, runOptions) }
      : { processor: postcss([node.createPlugin(context, options)]) }
  })

  const messageControl: PipelineControl = { postcssPlugin: 'weapp-tailwindcss-phase-messages', phase: 'platform', hook: 'prepare', position: 'first' }

  function platform(input: StylePipelineInput, processOptions: ProcessOptions, messages: Result['messages'], after: AcceptedPlugin[]) {
    const runOptions = { ...options, ctx: createContext() }
    markSelectorTransformOptionsStable(runOptions)
    const plugins: AcceptedPlugin[] = [{
      postcssPlugin: messageControl.postcssPlugin,
      prepare(result) {
        result.messages.push(...messages)
        return {}
      },
    }]
    for (const entry of recipe) {
      // Processor 由原生 normalize 直接拼接成员，不二次读取成员 postcss/getter。
      plugins.push(entry.processor ?? entry.create!(runOptions))
    }
    plugins.push(...after)
    return postcss(plugins).process(input, processOptions).async()
  }

  // 首次 process 必须保留原输入及同步错误，后续阶段自然沿 Promise 传播。
  function process(input: StylePipelineInput, processOptions: ProcessOptions = {}, after: AcceptedPlugin[] = []): Promise<Result> {
    if (!author.enabled) {
      return platform(input, processOptions, [], after)
    }
    const pending = author.processor.process(input, processOptions)
    return pending.async().then(result => platform(result.root, author.getOptions(result), result.messages, after))
  }
  return { process, controls: author.control ? [author.control, messageControl] : [messageControl] }
}
