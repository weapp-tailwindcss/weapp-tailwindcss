import type {
  TailwindGenerationSessionOptions,
  TailwindV4Engine,
  TailwindV4GenerateResult,
  TailwindV4ResolvedSource,
} from './types.ts'
import { createTailwindV4EngineGenerationSession } from './generation-session.ts'

export function createTailwindV4Engine(source: TailwindV4ResolvedSource, options?: TailwindGenerationSessionOptions): TailwindV4Engine {
  const session = createTailwindV4EngineGenerationSession(source, options)
  return {
    source,
    dispose() {
      session.dispose()
    },
    loadDesignSystem() {
      return session.loadDesignSystem()
    },
    async validateCandidates(candidates) {
      return session.validateCandidates(candidates)
    },
    generate(options): Promise<TailwindV4GenerateResult> {
      return session.generateLegacy(options)
    },
  }
}
