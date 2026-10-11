import type { Root } from '@weapp-tailwindcss/postcss/transform'

export type CompilerMode = 'legacy' | 'shadow' | 'graph'

export type CssFragmentKind = 'tailwind' | 'theme' | 'preflight' | 'user' | 'import'

export type CssStage = 'raw' | 'framework-processed' | 'adapted'

export type SourceKind = 'css' | 'template' | 'script' | 'config' | 'asset'

export type SourceScopeKind = 'global' | 'subpackage' | 'component'

export type SourceEdgeKind = 'imports' | 'candidate-source' | 'depends-on' | 'emits-to'

export interface SourceScope {
  id: string
  kind: SourceScopeKind
}

export interface SourceGraphNode {
  id: string
  kind: SourceKind
  scope: SourceScope
  content?: string | undefined
}

export interface SourceGraphEdge {
  from: string
  to: string
  kind: SourceEdgeKind
}

export interface CssFragment {
  id: string
  kind: CssFragmentKind
  root: Root
  sourceId: string
  scope: SourceScope
  order: number
  stage: CssStage
}

export interface GenerationArtifact {
  fragments: CssFragment[]
  classSet: Set<string>
  rawCandidates: Set<string>
  dependencies: string[]
  sourceEntries: string[]
  revision?: number | undefined
}

export interface CandidateChange {
  sourceId: string
  addedCandidates: Set<string>
  removedCandidates: Set<string>
}

export type CompilationChange
  = | CandidateChange
    | { sourceId: string, type: 'source-removed' }
    | { sourceId: string, type: 'dependency-changed' }
    | { sourceId: string, type: 'config-changed' }

export interface CompilationGraphSnapshot {
  nodes: SourceGraphNode[]
  edges: SourceGraphEdge[]
}

export interface CompilationSnapshot extends CompilationGraphSnapshot {
  candidatesBySource?: Iterable<readonly [string, Iterable<string>]> | undefined
  changes?: CompilationChange[] | undefined
  preserveDeletedCss?: boolean | undefined
  validatedClassSet?: Iterable<string> | undefined
}

export interface CompilationResult {
  revision: number
  candidates: Set<string>
  candidatesBySource: Map<string, Set<string>>
  validatedClassSet: Set<string>
  invalidatedScopes: Set<string>
  graphEdges: SourceGraphEdge[]
  graphNodes: SourceGraphNode[]
}

export interface CompilationSession {
  update: (snapshot: CompilationSnapshot) => CompilationResult | Promise<CompilationResult>
  commitValidation: (
    revision: number,
    validatedClassSet: Iterable<string>,
    graph?: CompilationGraphSnapshot | undefined,
  ) => CompilationResult | Promise<CompilationResult>
  dispose: () => void
}

export interface PlatformGenerationRequest {
  sourceId: string
  scope: SourceScope
  css: string
  candidates: Set<string>
}

export interface PreparedPlatformGenerationRequest extends PlatformGenerationRequest {
  restoreCandidates?: ReadonlyMap<string, string> | undefined
}

export interface PlatformAdapterContext {
  stage: CssStage
}

export interface PlatformAdapter {
  id: 'web' | 'mini-program' | 'native-app'
  prepare: (request: PlatformGenerationRequest) => PreparedPlatformGenerationRequest
  transform: (artifact: GenerationArtifact, context: PlatformAdapterContext) => Promise<GenerationArtifact>
}
