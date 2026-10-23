import { disposeCompilationChangeCoordinator } from './compilation-change-coordinator'
import { disposeCompilationSessionPool } from './compilation-session-pool'
import { runCompilerOwnerDisposal } from './compiler-owner-state'
import { disposeFrameworkCompilerSession } from './framework-compiler-session'
import { disposeCompilerShadowReportSession } from './shadow-report-session'
import { disposeTailwindGenerationSessionPool } from './tailwind-generation-session-pool'

async function disposeCompilerOwnerResources(owner: object, options: DisposeCompilerOwnerOptions) {
  const cleanups = [
    () => options.beforeDispose?.(),
    () => disposeCompilationChangeCoordinator(owner),
    () => disposeCompilationSessionPool(owner),
    () => disposeFrameworkCompilerSession(owner),
    () => disposeTailwindGenerationSessionPool(owner),
    () => disposeCompilerShadowReportSession(owner),
  ]
  const errors: unknown[] = []
  for (const cleanup of cleanups) {
    try {
      await cleanup()
    }
    catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, '编译会话释放失败，已继续释放其余资源。')
  }
}

export interface DisposeCompilerOwnerOptions {
  beforeDispose?: (() => void | Promise<void>) | undefined
}

export function disposeCompilerOwner(owner: object, options: DisposeCompilerOwnerOptions = {}) {
  return runCompilerOwnerDisposal(owner, () => disposeCompilerOwnerResources(owner, options))
}
