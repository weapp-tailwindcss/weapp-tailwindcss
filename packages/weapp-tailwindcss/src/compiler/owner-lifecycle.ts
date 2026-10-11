import { disposeCompilationChangeCoordinator } from './compilation-change-coordinator'
import { disposeCompilationSessionPool } from './compilation-session-pool'
import { runCompilerOwnerDisposal } from './compiler-owner-state'
import { disposeFrameworkCompilerSession } from './framework-compiler-session'
import { disposeCompilerShadowReportSession } from './shadow-report-session'
import { disposeTailwindGenerationSessionPool } from './tailwind-generation-session-pool'

async function disposeCompilerOwnerResources(owner: object) {
  disposeCompilationChangeCoordinator(owner)
  await disposeCompilationSessionPool(owner)
  await disposeFrameworkCompilerSession(owner)
  disposeTailwindGenerationSessionPool(owner)
  disposeCompilerShadowReportSession(owner)
}

export function disposeCompilerOwner(owner: object) {
  return runCompilerOwnerDisposal(owner, () => disposeCompilerOwnerResources(owner))
}
