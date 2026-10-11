import { collectGeneratedCssClassCandidates } from '@weapp-tailwindcss/postcss/transform'
import { isRuntimeTransformCandidate } from './runtime-candidates'

export { collectWebpackCssRuleIdentityMarkers, hasAdditionalWebpackAssetUserCssMarkers, isOnlyWebpackTailwindGeneratedPreflightCss, parseWebpackCssLayerNames, removeWebpackTailwindGeneratedAssetCss, unescapeCssIdentifier } from '@weapp-tailwindcss/postcss/transform'

export function collectGeneratedCssRuntimeCandidates(source: string) {
  const candidates = collectGeneratedCssClassCandidates(source)
  for (const candidate of candidates) {
    if (!isRuntimeTransformCandidate(candidate)) {
      candidates.delete(candidate)
    }
  }
  return candidates
}

export { hasWebpackTailwindSourceDirectives } from '@weapp-tailwindcss/postcss/transform'
