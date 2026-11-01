import type { AcceptedPlugin, ProcessOptions, Processor, Result } from 'postcss'
import type { resolvePostcssFrameworkProfile } from '../frameworks'

export type PipelineStage = 'pre' | 'normal' | 'post'

export interface PipelineNodeCursor {
  id: string
  stage: PipelineStage
}

export interface PipelineNodeContext {
  stage: PipelineStage
  /**
   * 整个流水线内的顺序索引（从 0 开始）
   */
  index: number
  /**
   * 当前流水线包含的节点总数
   */
  size: number
  /**
   * 所在阶段内的顺序索引（从 0 开始）
   */
  stageIndex: number
  /**
   * 所在阶段的节点数量
   */
  stageSize: number
  /**
   * 指向前一个节点的游标（若存在）
   */
  previous?: PipelineNodeCursor
  /**
   * 指向后一个节点的游标（若存在）
   */
  next?: PipelineNodeCursor
}

export interface ResolvedPipelineNode extends PipelineNodeCursor {
  plugin: AcceptedPlugin
  context: PipelineNodeContext
}

export interface PhasedPipelineNode extends PipelineNodeCursor {
  phase: 'author' | 'platform'
  context: PipelineNodeContext
}

export type StylePipelineInput = Parameters<Processor['process']>[0]

interface PipelineProfile {
  framework: ReturnType<typeof resolvePostcssFrameworkProfile>['framework']
  target: ReturnType<typeof resolvePostcssFrameworkProfile>['target']
  branch: ReturnType<typeof resolvePostcssFrameworkProfile>['branch']
  /** 完整异步处理；首个原生 process 的同步构造错误仍同步抛出。 */
  process: (input: StylePipelineInput, options?: ProcessOptions, after?: AcceptedPlugin[]) => Promise<Result>
}

export interface FlatStyleProcessingPipeline extends PipelineProfile {
  kind: 'flat'
  nodes: ResolvedPipelineNode[]
  plugins: AcceptedPlugin[]
}

export interface PipelineControl {
  postcssPlugin: string
  phase: 'author' | 'platform'
  hook: 'prepare'
  position: 'first'
}

export interface PhasedStyleProcessingPipeline extends PipelineProfile {
  kind: 'phased'
  nodes: PhasedPipelineNode[]
  /** 实际内部首 prepare 控制钩子；nodes 表示语义配方节点。 */
  controls: PipelineControl[]
}

export type StyleProcessingPipeline = FlatStyleProcessingPipeline | PhasedStyleProcessingPipeline
