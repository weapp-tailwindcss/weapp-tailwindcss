import { retainUniAppXAuthorApplyCss as retainAuthorApplyCss } from '@weapp-tailwindcss/postcss/transform'
import { removeTailwindSourceDirectives } from '@/generation/directives'

export function retainUniAppXAuthorApplyCss(
  generatedCss: string,
  authorCss: string,
  options?: { preserveRuntimeProperties?: boolean },
) {
  return retainAuthorApplyCss(
    generatedCss,
    removeTailwindSourceDirectives(authorCss, { importFallback: true }),
    options,
  )
}
