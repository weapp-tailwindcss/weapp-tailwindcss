import type { InternalGenerationRequest } from './generation-request.ts'
import type {
  SourceEntry,
  TailwindGenerationArtifact,
  TailwindV4ResolvedSource,
} from './types.ts'
import postcss from 'postcss'

function cloneSourceEntry(sourceEntry: SourceEntry): SourceEntry {
  return {
    id: sourceEntry.id,
    content: sourceEntry.content,
    ...(sourceEntry.extension === undefined ? {} : { extension: sourceEntry.extension }),
  }
}

export function cloneTailwindGenerationArtifact(
  artifact: TailwindGenerationArtifact,
): TailwindGenerationArtifact {
  return {
    fragments: artifact.fragments.map(fragment => ({
      ...fragment,
      root: fragment.root.clone(),
    })),
    classSet: new Set(artifact.classSet),
    rawCandidates: new Set(artifact.rawCandidates),
    dependencies: [...artifact.dependencies],
    sourceEntries: artifact.sourceEntries.map(cloneSourceEntry),
  }
}

export function createTailwindGenerationArtifact(
  css: string,
  source: TailwindV4ResolvedSource,
  request: InternalGenerationRequest,
  classSet: Set<string>,
  rawCandidates: Set<string>,
  dependencies: string[],
): TailwindGenerationArtifact {
  const sourceId = source.dependencies[0] ?? source.base
  return {
    fragments: [{
      id: `${sourceId}:tailwind`,
      kind: 'tailwind',
      root: postcss.parse(css, { from: sourceId }),
      sourceId,
      order: 0,
    }],
    classSet: new Set(classSet),
    rawCandidates: new Set(rawCandidates),
    dependencies: [...dependencies],
    sourceEntries: (request.sourceEntries ?? []).map(cloneSourceEntry),
  }
}
