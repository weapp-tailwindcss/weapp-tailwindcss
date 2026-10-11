import type { ChildNode, Root } from '@weapp-tailwindcss/postcss/transform'
import type { GenerationArtifact } from './types'

export interface SemanticCssDeclaration {
  type: 'declaration'
  property: string
  value: string
  important: boolean
}

export interface SemanticCssRule {
  type: 'rule'
  selector: string
  nodes: SemanticCssNode[]
}

export interface SemanticCssAtRule {
  type: 'at-rule'
  name: string
  params: string
  nodes: SemanticCssNode[]
}

export type SemanticCssNode = SemanticCssDeclaration | SemanticCssRule | SemanticCssAtRule

export interface ArtifactSemanticFragment {
  id: string
  kind: GenerationArtifact['fragments'][number]['kind']
  order: number
  scope: GenerationArtifact['fragments'][number]['scope']
  sourceId: string
  stage: GenerationArtifact['fragments'][number]['stage']
  root: SemanticCssNode[]
}

export interface ArtifactSemanticSnapshot {
  present: boolean
  fragments: ArtifactSemanticFragment[]
  classSet: string[]
  rawCandidates: string[]
  dependencies: string[]
  sourceEntries: string[]
}

export interface ArtifactSemanticDifference {
  kind: 'added' | 'removed' | 'changed'
  path: string
  left?: unknown
  right?: unknown
}

export interface ArtifactSemanticSummary {
  present: boolean
  fragments: number
  classes: number
  rawCandidates: number
  dependencies: number
  sourceEntries: number
}

export interface ArtifactSemanticComparison {
  equal: boolean
  differences: ArtifactSemanticDifference[]
  truncated: boolean
  left: ArtifactSemanticSummary
  right: ArtifactSemanticSummary
}

export interface CompareArtifactSemanticsOptions {
  maxDifferences?: number | undefined
}

const defaultMaxDifferences = 50

function isSemanticCssNode(node: SemanticCssNode | undefined): node is SemanticCssNode {
  return node !== undefined
}

function normalizeNode(node: ChildNode): SemanticCssNode | undefined {
  switch (node.type) {
    case 'comment':
      return undefined
    case 'decl':
      return {
        type: 'declaration',
        property: node.prop,
        value: node.value,
        important: Boolean(node.important),
      }
    case 'rule':
      return {
        type: 'rule',
        selector: node.selector,
        nodes: node.nodes.map(normalizeNode).filter(isSemanticCssNode),
      }
    case 'atrule':
      return {
        type: 'at-rule',
        name: node.name,
        params: node.params,
        nodes: node.nodes?.map(normalizeNode).filter(isSemanticCssNode) ?? [],
      }
  }
}

function createArtifactSemanticSummary(snapshot: ArtifactSemanticSnapshot): ArtifactSemanticSummary {
  return {
    present: snapshot.present,
    fragments: snapshot.fragments.length,
    classes: snapshot.classSet.length,
    rawCandidates: snapshot.rawCandidates.length,
    dependencies: snapshot.dependencies.length,
    sourceEntries: snapshot.sourceEntries.length,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function appendObjectPath(path: string, key: string) {
  return /^[A-Z_$][\w$]*$/i.test(key)
    ? `${path}.${key}`
    : `${path}[${JSON.stringify(key)}]`
}

function compareSemanticValues(
  left: unknown,
  right: unknown,
  path: string,
  state: {
    differences: ArtifactSemanticDifference[]
    equal: boolean
    maxDifferences: number
    truncated: boolean
  },
) {
  if (state.truncated || Object.is(left, right)) {
    return
  }

  if (left === undefined || right === undefined) {
    const value = left === undefined ? right : left
    if (Array.isArray(value) && value.length > 0) {
      for (let index = 0; index < value.length; index++) {
        compareSemanticValues(
          left === undefined ? undefined : value[index],
          right === undefined ? undefined : value[index],
          `${path}[${index}]`,
          state,
        )
        if (state.truncated) {
          return
        }
      }
      return
    }
    if (isRecord(value) && Object.keys(value).length > 0) {
      for (const key of Object.keys(value)) {
        compareSemanticValues(
          left === undefined ? undefined : value[key],
          right === undefined ? undefined : value[key],
          appendObjectPath(path, key),
          state,
        )
        if (state.truncated) {
          return
        }
      }
      return
    }
  }
  else if (Array.isArray(left) && Array.isArray(right)) {
    const length = Math.max(left.length, right.length)
    for (let index = 0; index < length; index++) {
      compareSemanticValues(left[index], right[index], `${path}[${index}]`, state)
      if (state.truncated) {
        return
      }
    }
    return
  }
  else if (isRecord(left) && isRecord(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)])
    for (const key of keys) {
      compareSemanticValues(left[key], right[key], appendObjectPath(path, key), state)
      if (state.truncated) {
        return
      }
    }
    return
  }

  state.equal = false
  if (state.differences.length >= state.maxDifferences) {
    state.truncated = true
    return
  }
  state.differences.push({
    kind: left === undefined ? 'added' : right === undefined ? 'removed' : 'changed',
    path,
    ...(left === undefined ? {} : { left }),
    ...(right === undefined ? {} : { right }),
  })
}

export function normalizeCssRoot(root: Root): SemanticCssNode[] {
  return root.nodes.map(normalizeNode).filter(isSemanticCssNode)
}

export function createArtifactSemanticSnapshot(
  artifact: GenerationArtifact | undefined,
): ArtifactSemanticSnapshot {
  if (artifact === undefined) {
    return {
      present: false,
      fragments: [],
      classSet: [],
      rawCandidates: [],
      dependencies: [],
      sourceEntries: [],
    }
  }
  return {
    present: true,
    fragments: [...artifact.fragments]
      .sort((left, right) => left.order - right.order || left.id.localeCompare(right.id))
      .map(fragment => ({
        id: fragment.id,
        kind: fragment.kind,
        order: fragment.order,
        scope: { ...fragment.scope },
        sourceId: fragment.sourceId,
        stage: fragment.stage,
        root: normalizeCssRoot(fragment.root),
      })),
    classSet: [...artifact.classSet].sort(),
    rawCandidates: [...artifact.rawCandidates].sort(),
    dependencies: [...artifact.dependencies].sort(),
    sourceEntries: [...artifact.sourceEntries].sort(),
  }
}

export function createArtifactSemanticSignature(artifact: GenerationArtifact) {
  return JSON.stringify(createArtifactSemanticSnapshot(artifact))
}

export function compareArtifactSemantics(
  left: GenerationArtifact | undefined,
  right: GenerationArtifact | undefined,
  options: CompareArtifactSemanticsOptions = {},
): ArtifactSemanticComparison {
  const leftSnapshot = createArtifactSemanticSnapshot(left)
  const rightSnapshot = createArtifactSemanticSnapshot(right)
  const maxDifferences = Math.max(0, Math.floor(options.maxDifferences ?? defaultMaxDifferences))
  const state = {
    differences: [] as ArtifactSemanticDifference[],
    equal: true,
    maxDifferences,
    truncated: false,
  }
  compareSemanticValues(leftSnapshot, rightSnapshot, '$', state)
  return {
    equal: state.equal,
    differences: state.differences,
    truncated: state.truncated,
    left: createArtifactSemanticSummary(leftSnapshot),
    right: createArtifactSemanticSummary(rightSnapshot),
  }
}

export function areArtifactsSemanticallyEqual(left: GenerationArtifact, right: GenerationArtifact) {
  return compareArtifactSemantics(left, right, { maxDifferences: 0 }).equal
}
