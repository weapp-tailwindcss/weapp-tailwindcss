import type { PipelineNodeContext, PipelineNodeCursor, PipelineStage } from './types'

export function createNodeContexts(cursors: PipelineNodeCursor[]): PipelineNodeContext[] {
  const stageSizes = new Map<PipelineStage, number>()
  // 预先统计各阶段节点数量，便于生成上下文
  cursors.forEach((node) => {
    stageSizes.set(node.stage, (stageSizes.get(node.stage) ?? 0) + 1)
  })

  const stageIndices = new Map<PipelineStage, number>()
  const contexts: PipelineNodeContext[] = []
  const size = cursors.length

  cursors.forEach((node, index) => {
    const stageIndex = stageIndices.get(node.stage) ?? 0
    const context: PipelineNodeContext = {
      stage: node.stage,
      index,
      size,
      stageIndex,
      stageSize: stageSizes.get(node.stage) ?? 0,
    }

    if (index > 0) {
      const prevNode = cursors[index - 1]
      if (prevNode) {
        context.previous = {
          id: prevNode.id,
          stage: prevNode.stage,
        }
      }
    }

    if (index < size - 1) {
      const nextNode = cursors[index + 1]
      if (nextNode) {
        context.next = {
          id: nextNode.id,
          stage: nextNode.stage,
        }
      }
    }

    stageIndices.set(node.stage, stageIndex + 1)

    contexts.push(context)
  })
  return contexts
}
