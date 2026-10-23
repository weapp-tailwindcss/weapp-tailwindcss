import type { IStyleHandlerOptions } from '@weapp-tailwindcss/postcss/types'
import type { TailwindV4GenerateTarget } from './types'
import type { AppType } from '@/types'
import { transformTailwindV4GeneratedCss } from '@weapp-tailwindcss/postcss/transform'
import { shouldUseContextWebRpxCompatibility } from '@/framework-policies/environment-snapshot'

export {
  normalizeTailwindV4GeneratedUrlValues,
  transformTailwindV4CssToWeapp,
  transformTailwindV4WebRpxCss,
} from '@weapp-tailwindcss/postcss/transform'

export function transformTailwindV4CssByTarget(
  css: string,
  target: TailwindV4GenerateTarget,
  options?: Partial<IStyleHandlerOptions> & { appType?: AppType | undefined },
) {
  return transformTailwindV4GeneratedCss(css, target, options, shouldUseContextWebRpxCompatibility(options))
}
