import type { WebCssCompatDiagnostic, WebCssCompatFeatures, WebCssCompatOptions, WebCssCompatTargetSnapshot, WebCssCompatUserOptions } from '../types'
import type { NormalizedWebCssCompatPolicy } from './web-css-policy'
import { transformedFeatures } from './web-css-helpers'
import { normalizeWebCssCompatPolicy } from './web-css-policy'

export interface NormalizedWebCssCompatOptions {
  preset: 'off' | 'legacy-web'
  features: Required<WebCssCompatFeatures>
  policy: NormalizedWebCssCompatPolicy
  layersModeExplicit: boolean
}

export interface TransformWebCssCompatProcessing {
  deferPropertyFallback?: boolean | undefined
  file?: string | undefined
  target?: WebCssCompatTargetSnapshot | undefined
  onDiagnostic?: ((diagnostic: WebCssCompatDiagnostic) => void) | undefined
}

export interface TransformWebCssCompatResult {
  css: string
  diagnostics: readonly WebCssCompatDiagnostic[]
}

const disabledFeatures: Required<WebCssCompatFeatures> = {
  theme: false,
  layer: false,
  property: false,
  nesting: false,
  oklch: false,
  colorFunctions: false,
  supports: false,
}

function normalizeWebCssCompatOptionsObject(options: WebCssCompatOptions): NormalizedWebCssCompatOptions {
  const preset = options.preset ?? 'legacy-web'
  const policy = normalizeWebCssCompatPolicy(options)
  return {
    preset,
    features: transformedFeatures(policy),
    policy,
    layersModeExplicit: options.policy?.layers?.action !== undefined
      || options.policy?.layers?.mode !== undefined
      || options.policy?.layers?.onConflict !== undefined,
  }
}

export function normalizeWebCssCompatOptions(options: WebCssCompatUserOptions | undefined): NormalizedWebCssCompatOptions {
  if (options === true) {
    return normalizeWebCssCompatOptionsObject({ preset: 'legacy-web' })
  }
  if (!options) {
    return {
      preset: 'off',
      features: disabledFeatures,
      policy: normalizeWebCssCompatPolicy({ preset: 'off' }),
      layersModeExplicit: false,
    }
  }
  return normalizeWebCssCompatOptionsObject(options)
}
