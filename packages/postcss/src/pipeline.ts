// 按阶段构建 PostCSS 管线，描述与执行共享同一份实际配方。
import type { FeatureSignal } from './content-probe'
import type { PhasedPipelineNode, ResolvedPipelineNode, StyleProcessingPipeline } from './pipeline/types'
import type { IStyleHandlerOptions } from './types'
import postcss from 'postcss'
import { resolvePostcssFrameworkProfile } from './frameworks'
import { createNodeContexts } from './pipeline/context'
import { createPhasedExecutor } from './pipeline/execution'
import { createPreparedNodes } from './pipeline/nodes'
import { createContext } from './plugins/ctx'
import { markSelectorTransformOptionsStable } from './selectorParser/rule-transformer/options'

export type {
  FlatStyleProcessingPipeline,
  PhasedPipelineNode,
  PhasedStyleProcessingPipeline,
  PipelineControl,
  PipelineNodeContext,
  PipelineNodeCursor,
  PipelineStage,
  ResolvedPipelineNode,
  StylePipelineInput,
  StyleProcessingPipeline,
} from './pipeline/types'

export function createStylePipeline(options: IStyleHandlerOptions, signal?: FeatureSignal): StyleProcessingPipeline {
  options.ctx = createContext()
  markSelectorTransformOptionsStable(options)
  const prepared = createPreparedNodes(options, signal)
  const { framework, target, branch } = resolvePostcssFrameworkProfile(options)
  if (prepared.author) {
    const authorCursor = { id: 'pre:user-0', stage: 'pre' as const }
    const cursors = [authorCursor, ...prepared.nodes]
    const contexts = createNodeContexts(cursors)
    const nodes: PhasedPipelineNode[] = cursors.map((node, index) => ({
      id: node.id,
      stage: node.stage,
      phase: index === 0 ? 'author' : 'platform',
      context: contexts[index]!,
    }))
    return {
      kind: 'phased',
      framework,
      target,
      branch,
      nodes,
      ...createPhasedExecutor(options, prepared.author, prepared.nodes, contexts.slice(1)),
    }
  }
  const contexts = createNodeContexts(prepared.nodes)
  const nodes: ResolvedPipelineNode[] = prepared.nodes.map((node, index) => ({
    id: node.id,
    stage: node.stage,
    plugin: node.createPlugin(contexts[index]!, options),
    context: contexts[index]!,
  }))
  const plugins = nodes.map(node => node.plugin)
  return {
    kind: 'flat',
    framework,
    target,
    branch,
    nodes,
    plugins,
    process(input, processOptions = {}, after = []) {
      return postcss([...plugins, ...after]).process(input, processOptions).async()
    },
  }
}
