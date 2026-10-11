import type { Selector, SelectorComponent } from 'lightningcss'

export function createTypeSelector(name: string): SelectorComponent {
  return {
    type: 'type',
    name,
  }
}

export function cloneComponent<T>(value: T): T {
  const structured = (globalThis as typeof globalThis & {
    structuredClone?: <U>(input: U) => U
  }).structuredClone
  if (typeof structured === 'function') {
    return structured(value)
  }
  return JSON.parse(JSON.stringify(value)) as T
}

export function cloneComponents(list: SelectorComponent[]): SelectorComponent[] {
  return list.map(cloneComponent)
}

export function normalizeNestedSelectors(
  selectors: Selector[] | Selector | null | undefined,
): Selector[] | undefined {
  if (!selectors) {
    return undefined
  }

  if (Array.isArray(selectors)) {
    if (selectors.length === 0) {
      return []
    }

    const first = selectors[0]
    if (Array.isArray(first)) {
      return selectors as Selector[]
    }

    return [selectors as Selector]
  }

  return [selectors]
}

export function assignNestedSelectors(
  target: SelectorComponent & { selectors?: Selector[] | Selector | null },
  value: Selector[] | undefined,
) {
  if (!('selectors' in target)) {
    return
  }

  if (Array.isArray(target.selectors)) {
    target.selectors = value ?? []
  }
  else if (target.selectors && !Array.isArray(target.selectors)) {
    target.selectors = value?.[0] ?? target.selectors
  }
}

export function trimCombinators(components: SelectorComponent[]): SelectorComponent[] {
  let start = 0
  let end = components.length
  while (start < end && components[start]?.type === 'combinator') {
    start++
  }
  while (end > start && components[end - 1]?.type === 'combinator') {
    end--
  }
  return components.slice(start, end)
}

export function matchesHiddenNot(component: SelectorComponent | undefined): boolean {
  if (!component || component.type !== 'pseudo-class' || component.kind !== 'not') {
    return false
  }
  const selectors = normalizeNestedSelectors(component.selectors)
  if (!selectors || selectors.length !== 1) {
    return false
  }
  const [nestedSelector] = selectors
  if (!nestedSelector || nestedSelector.length !== 1) {
    return false
  }
  const [node] = nestedSelector
  if (!node) {
    return false
  }
  return (
    (node.type === 'attribute' && node.name === 'hidden')
    || (node.type === 'type' && node.name === 'template')
  )
}
