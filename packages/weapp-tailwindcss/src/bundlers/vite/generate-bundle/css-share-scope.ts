import type { InternalUserDefinedOptions } from '@/types'
import path from 'node:path'
import { hasCssLocationDependencies } from '@weapp-tailwindcss/postcss/transform'
import {
  hasTailwindSourceDirectives,
} from '@/generation/directives'
import {
  hasTailwindGeneratedCssMarkers,
} from '@/generation/markers'
import { normalizeWeappTailwindcssGeneratorOptions } from '@/generator'
import { normalizeOutputPathKey } from '../../shared/module-graph'

export function createCssTransformShareScope(file: string, rawSource: string) {
  if (hasCssLocationDependencies(rawSource)) {
    return `dir:${normalizeOutputPathKey(path.dirname(file))}`
  }
  return 'global'
}

export function createCssTransformShareScopeKey(
  opts: InternalUserDefinedOptions,
  file: string,
  rawSource: string,
) {
  if (opts.mainCssChunkMatcher(file, opts.appType)) {
    return `main:${normalizeOutputPathKey(file)}`
  }
  const generatorOptions = normalizeWeappTailwindcssGeneratorOptions(opts.generator)
  if (
    hasTailwindGeneratedCssMarkers(rawSource)
    || hasTailwindSourceDirectives(rawSource, { importFallback: generatorOptions.importFallback })
  ) {
    return `source:${normalizeOutputPathKey(file)}`
  }
  return createCssTransformShareScope(file, rawSource)
}

export function createCssRuntimeSignature(runtimeSignature: string, generatorCandidateSignature: string) {
  return `${runtimeSignature}:${generatorCandidateSignature}`
}
