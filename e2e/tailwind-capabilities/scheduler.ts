import type { ExecutionStage } from './execution-record'
import type { ExecutionTarget } from './plan'
import { formatWorkflowError } from '../../scripts/e2e-preflight/cleanup'
import { findEnvironmentBlock } from './environment-block'

interface SchedulerDependencies {
  check: (target: ExecutionTarget) => Promise<void>
  execute: (target: ExecutionTarget) => Promise<unknown>
  classify: (target: ExecutionTarget) => Promise<string>
  persist: () => Promise<void>
}

/** 普通断言失败保留其它目标诊断；预检或工具环境故障立即停止全部后续调用。 */
export async function scheduleTargets(stages: ExecutionStage[], dependencies: SchedulerDependencies) {
  try {
    for (const stage of stages) {
      const target = stage.target as ExecutionTarget
      await dependencies.check(target)
      stage.attempted = true
      await dependencies.persist()
      try {
        await dependencies.execute(target)
        stage.status = 'passed'
      }
      catch (error) {
        stage.reason = formatWorkflowError(error)
        if (findEnvironmentBlock(error)) {
          stage.status = 'blocked'
          throw error
        }
        stage.status = await dependencies.classify(target).catch(() => 'failed')
      }
      await dependencies.persist()
    }
  }
  catch (error) {
    for (const pending of stages.filter(stage => !stage.attempted)) {
      pending.status = 'blocked'
      pending.reason = `环境阻断，未启动：${formatWorkflowError(error)}`
    }
    throw error
  }
  finally {
    await dependencies.persist()
  }
}
