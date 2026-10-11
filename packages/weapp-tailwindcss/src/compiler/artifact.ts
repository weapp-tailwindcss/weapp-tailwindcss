import type { CssFragment, CssFragmentKind, CssStage, GenerationArtifact, SourceScope } from './types'
import { postcss } from '@weapp-tailwindcss/postcss/transform'

export interface CreateCssFragmentOptions {
  id: string
  kind: CssFragmentKind
  css: string
  sourceId: string
  scope: SourceScope
  order?: number | undefined
  stage?: CssStage | undefined
}

export function createCssFragment(options: CreateCssFragmentOptions): CssFragment {
  return {
    id: options.id,
    kind: options.kind,
    root: postcss.parse(options.css, { from: options.sourceId }),
    sourceId: options.sourceId,
    scope: options.scope,
    order: options.order ?? 0,
    stage: options.stage ?? 'raw',
  }
}

export function cloneCssFragment(fragment: CssFragment): CssFragment {
  return {
    ...fragment,
    root: fragment.root.clone(),
    scope: { ...fragment.scope },
  }
}

export function cloneGenerationArtifact(artifact: GenerationArtifact): GenerationArtifact {
  return {
    fragments: artifact.fragments.map(cloneCssFragment),
    classSet: new Set(artifact.classSet),
    rawCandidates: new Set(artifact.rawCandidates),
    dependencies: [...artifact.dependencies],
    sourceEntries: [...artifact.sourceEntries],
    ...(artifact.revision === undefined ? {} : { revision: artifact.revision }),
  }
}

export function createGenerationArtifact(
  fragments: CssFragment[],
  options: Omit<GenerationArtifact, 'fragments'>,
): GenerationArtifact {
  return cloneGenerationArtifact({
    fragments,
    ...options,
  })
}
