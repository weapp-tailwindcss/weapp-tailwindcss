import type { TailwindV4GenerateTarget } from './types'
import type { ResolvedGenerationStyleOptions } from '@/compiler/style-capabilities'
import { transformTailwindV4GeneratedCss } from '@weapp-tailwindcss/postcss/transform'
import { useWebRpxCompatibility } from '@/compiler/style-capabilities'

export {
  normalizeTailwindV4GeneratedUrlValues,
  transformTailwindV4CssToWeapp,
  transformTailwindV4WebRpxCss,
} from '@weapp-tailwindcss/postcss/transform'

export function transformTailwindV4CssByTarget(
  css: string,
  target: TailwindV4GenerateTarget,
  options?: ResolvedGenerationStyleOptions,
) {
  return transformTailwindV4GeneratedCss(css, target, options, useWebRpxCompatibility(options))
}
