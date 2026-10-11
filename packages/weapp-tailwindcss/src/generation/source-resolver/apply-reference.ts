import { createTailwindV4SourceReferenceSource, hasTailwindApplyContextDirective } from '@weapp-tailwindcss/postcss/transform'
import { hasTailwindRootDirectives } from '../directives'

export { createTailwindV4SourceReferenceSource } from '@weapp-tailwindcss/postcss/transform'

interface TailwindV4ApplyReferenceSourceOptions {
  cssEntries?: string[] | undefined
  cssSources?: Array<{
    css?: string | undefined
    file?: string | undefined
  }> | undefined
  packageName?: string | undefined
}

function resolveTailwindV4ApplyReference(options: TailwindV4ApplyReferenceSourceOptions) {
  const references = new Set<string>()
  for (const source of options.cssSources ?? []) {
    if (
      typeof source.file === 'string'
      && source.file.length > 0
      && typeof source.css === 'string'
      && hasTailwindRootDirectives(source.css, { importFallback: true })
      && hasTailwindApplyContextDirective(source.css)
    ) {
      references.add(source.file)
    }
  }
  return references.size === 1 ? references.values().next().value : undefined
}

export function createTailwindV4ApplyReferenceSource(css: string, sourceOptions: TailwindV4ApplyReferenceSourceOptions) {
  const reference = resolveTailwindV4ApplyReference(sourceOptions)
  return createTailwindV4SourceReferenceSource(
    css,
    sourceOptions,
    reference ? `@reference ${JSON.stringify(reference.replace(/\\/g, '/'))};` : undefined,
  )
}
