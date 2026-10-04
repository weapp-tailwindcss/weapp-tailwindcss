import type { Rule } from 'postcss'
import type { InternalCssSelectorReplacerOptions, IStyleHandlerOptions } from '../../types'

export interface TransformContext {
  rule: Rule
  options: IStyleHandlerOptions
  requiresSpacingNormalization: boolean
  rootReplacement?: string
  universalReplacement?: string
  selectorReplacerOptions?: InternalCssSelectorReplacerOptions
  classReplacements?: ReadonlyMap<string, string>
  unsupportedPseudoClasses?: ReadonlySet<string>
}

export interface CachedSelectorTransformResult {
  action: 'keep' | 'update' | 'remove'
  selector?: string
}
