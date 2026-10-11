import type { CssFragment, GenerationArtifact } from './types'
import { postcss } from '@weapp-tailwindcss/postcss/transform'
import { cloneGenerationArtifact } from './artifact'

export function orderCssFragments(fragments: Iterable<CssFragment>): CssFragment[] {
  return [...fragments].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
}

export function composeGenerationArtifact(artifact: GenerationArtifact) {
  const cloned = cloneGenerationArtifact(artifact)
  const root = postcss.root()
  for (const fragment of orderCssFragments(cloned.fragments)) {
    root.append(fragment.root.nodes.map(node => node.clone()))
  }
  return {
    artifact: cloned,
    root,
    css: root.toString(),
  }
}
