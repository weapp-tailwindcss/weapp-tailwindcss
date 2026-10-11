import type { CompilerRootSession } from './root-store'
import type { CompilerGenerateRequest } from './types'
import type { CompilationGraphSnapshot, CompilationResult, SourceGraphNode, SourceScope } from '@/compiler/types'
import type { TailwindV4ResolvedSource } from '@/generator'

export interface CompilerCompilationCacheEntry {
  candidateSignature: string
  compilation: CompilationResult
  graph: CompilationGraphSnapshot
}

interface PreparedCompilerGeneration extends CompilerCompilationCacheEntry {
  compilation: CompilationResult
  explicitCandidates: boolean
  graph: CompilationGraphSnapshot
}

function createGenerationGraph(
  rootId: string,
  source: TailwindV4ResolvedSource,
  dependencies: Iterable<string>,
) {
  const scope: SourceScope = { id: rootId, kind: 'global' }
  const dependencyIds = [...new Set(dependencies)].filter(id => id !== rootId).sort()
  const nodes: SourceGraphNode[] = [
    { content: source.css, id: rootId, kind: 'css', scope },
    ...dependencyIds.map(id => ({ id, kind: 'config' as const, scope })),
  ]
  return {
    edges: dependencyIds.map(id => ({ from: rootId, kind: 'depends-on' as const, to: id })),
    nodes,
  }
}

export function prepareCompilerGeneration(
  entry: CompilerRootSession,
  request: CompilerGenerateRequest,
  source: TailwindV4ResolvedSource,
  sourceChanged: boolean,
): PreparedCompilerGeneration {
  const explicitCandidates = request.candidates !== undefined
  const candidates = explicitCandidates ? [...request.candidates!] : []
  const candidateSignature = [...candidates].sort().join('\0')
  if (
    !sourceChanged
    && entry.compilationCache?.candidateSignature === candidateSignature
    && entry.compilationCache.compilation.revision === entry.compilationRevision
  ) {
    return {
      ...entry.compilationCache,
      explicitCandidates,
    }
  }
  const graph = createGenerationGraph(entry.id, source, source.dependencies)
  const compilation = entry.compilation.update({
    ...graph,
    candidatesBySource: [[entry.id, candidates]],
    changes: sourceChanged
      ? [{ sourceId: entry.id, type: 'dependency-changed' }]
      : undefined,
  })
  entry.compilationRevision = compilation.revision
  return { candidateSignature, compilation, explicitCandidates, graph }
}

export function commitCompilerGeneration(
  entry: CompilerRootSession,
  prepared: PreparedCompilerGeneration,
  source: TailwindV4ResolvedSource,
  dependencies: Iterable<string>,
  classSet: Iterable<string>,
) {
  const graph = createGenerationGraph(entry.id, source, dependencies)
  const compilation = entry.compilation.commitValidation(
    prepared.compilation.revision,
    classSet,
    graph,
  )
  entry.compilationCache = {
    candidateSignature: prepared.candidateSignature,
    compilation,
    graph,
  }
}
