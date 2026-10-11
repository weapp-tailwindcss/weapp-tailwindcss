import type { Selector, SelectorComponent, TransformOptions } from 'lightningcss'
import type { IStyleHandlerOptions } from '../../types'
import { internalCssSelectorReplacer } from '../../shared'
import {
  assignNestedSelectors,
  cloneComponent,
  cloneComponents,
  createTypeSelector,
  matchesHiddenNot,
  normalizeNestedSelectors,
  trimCombinators,
} from './selector-utils'

type CustomAtRules = Record<string, never>

type SelectorListTransformer = (
  selectors: Selector[],
  ctx: SelectorTransformContext,
) => Selector[]

export interface SelectorTransformContext {
  options: IStyleHandlerOptions
  childCombinatorReplacement?: SelectorComponent[] | undefined
}

function buildSelectorReplacement(value: string | string[] | false | undefined): SelectorComponent[] | null {
  if (!value) {
    return null
  }

  const targets = Array.isArray(value) ? value : [value]
  if (!targets.length) {
    return null
  }

  if (targets.length === 1) {
    return [createTypeSelector(targets[0]!)]
  }

  return [
    {
      type: 'pseudo-class',
      kind: 'is',
      selectors: targets.map(name => [createTypeSelector(name)]),
    },
  ]
}

export function buildChildCombinatorReplacement(options: IStyleHandlerOptions): SelectorComponent[] | undefined {
  const { cssChildCombinatorReplaceValue } = options
  if (!cssChildCombinatorReplaceValue) {
    return undefined
  }

  const normalized = Array.isArray(cssChildCombinatorReplaceValue)
    ? cssChildCombinatorReplaceValue
    : [cssChildCombinatorReplaceValue]

  if (!normalized.length) {
    return undefined
  }

  const baseComponents = buildSelectorReplacement(normalized) ?? [createTypeSelector('view')]
  const left = cloneComponents(baseComponents)
  const right = cloneComponents(baseComponents)

  return [
    ...left,
    {
      type: 'combinator',
      value: 'next-sibling',
    },
    ...right,
  ]
}

function transformSelectorComponent(
  component: SelectorComponent,
  ctx: SelectorTransformContext,
  transformList: SelectorListTransformer,
): SelectorComponent[] | null {
  const { options } = ctx

  if (component.type === 'class') {
    const cloned = cloneComponent(component)
    cloned.name = internalCssSelectorReplacer(component.name, {
      escapeMap: options.escapeMap,
    })
    return [cloned]
  }

  if (component.type === 'universal') {
    const replacement = buildSelectorReplacement(options.cssSelectorReplacement?.universal)
    if (replacement) {
      return cloneComponents(replacement)
    }
    return [cloneComponent(component)]
  }

  if (component.type === 'type') {
    if (options.uniAppX) {
      return []
    }
    return [cloneComponent(component)]
  }

  if (component.type === 'attribute') {
    if (options.uniAppX) {
      return []
    }
    return [cloneComponent(component)]
  }

  if (component.type === 'combinator') {
    return [cloneComponent(component)]
  }

  if (component.type === 'pseudo-element') {
    return [cloneComponent(component)]
  }

  if (component.type === 'pseudo-class') {
    if (component.kind === 'hover' && options.cssRemoveHoverPseudoClass) {
      return null
    }

    if (component.kind === 'root') {
      const replacement = buildSelectorReplacement(options.cssSelectorReplacement?.root)
      if (replacement) {
        return cloneComponents(replacement)
      }
      return [cloneComponent(component)]
    }

    const cloned = cloneComponent(component)

    if ('selectors' in cloned) {
      const nestedSelectors = normalizeNestedSelectors(cloned.selectors)
      if (nestedSelectors) {
        const transformedNested = transformList(nestedSelectors, ctx)
        assignNestedSelectors(cloned, transformedNested)
      }
    }

    if (cloned.kind === 'where' && options.uniAppX) {
      (cloned as SelectorComponent & { kind: typeof cloned.kind | 'is' }).kind = 'is'
    }

    return [cloned]
  }

  return [cloneComponent(component)]
}

function transformSelector(
  selector: Selector,
  ctx: SelectorTransformContext,
  transformList: SelectorListTransformer,
): Selector | null {
  const { childCombinatorReplacement } = ctx
  const output: SelectorComponent[] = []

  for (let index = 0; index < selector.length; index++) {
    const component = selector[index]
    if (!component) {
      continue
    }

    if (component.type === 'combinator' && component.value === 'child' && childCombinatorReplacement) {
      const next = selector[index + 1]
      const combinator = selector[index + 2]
      const third = selector[index + 3]
      if (
        matchesHiddenNot(next)
        && combinator?.type === 'combinator'
        && (combinator.value === 'next-sibling' || combinator.value === 'later-sibling')
        && matchesHiddenNot(third)
      ) {
        output.push(cloneComponent(component))
        output.push(...cloneComponents(childCombinatorReplacement))
        index += 3
        continue
      }
    }

    const replaced = transformSelectorComponent(component, ctx, transformList)
    if (replaced === null) {
      return null
    }
    output.push(...replaced)
  }

  const trimmed = trimCombinators(output)
  return trimmed.length > 0 ? trimmed : null
}

function transformSelectorList(selectors: Selector[], ctx: SelectorTransformContext): Selector[] {
  const result: Selector[] = []
  for (const selector of selectors) {
    const transformed = transformSelector(selector, ctx, transformSelectorList)
    if (transformed && transformed.length > 0) {
      result.push(transformed)
    }
  }
  return result
}

export function createVisitor(ctx: SelectorTransformContext) {
  const visitor: TransformOptions<CustomAtRules>['visitor'] = {
    Rule(rule) {
      if (rule.type === 'property' && ctx.options.cssRemoveProperty) {
        return []
      }

      if (rule.type !== 'style') {
        return rule
      }

      const styleRule = rule.value
      if (!styleRule.selectors) {
        return rule
      }

      const selectors = transformSelectorList(styleRule.selectors, ctx)
      if (!selectors.length) {
        return []
      }
      styleRule.selectors = selectors
      return rule
    },
    RuleExit(rule) {
      if (rule.type !== 'style') {
        return rule
      }
      const styleRule = rule.value

      const selectors = styleRule.selectors ?? []
      const hasValidSelectors = selectors.some(selector => selector.length > 0)

      const declarationCount = styleRule.declarations?.declarations?.length ?? 0
      if (!hasValidSelectors || (ctx.options.uniAppX && declarationCount === 0)) {
        return []
      }
      return rule
    },
  }

  return visitor
}
