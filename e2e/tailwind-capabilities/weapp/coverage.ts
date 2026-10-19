import type { TailwindInventory } from '../inventory'
import type { CaseContract } from '../types'

export const weappFeatureBindings: Record<string, string[]> = {
  'width-arbitrary': ['utility/functional/w'],
  'height-arbitrary': ['utility/functional/h'],
  'size-width': ['utility/functional/size'],
  'size-height': ['utility/functional/size'],
  'padding': ['utility/functional/p'],
  'margin-negative': ['utility/functional/-mt'],
  'fraction': ['utility/functional/w'],
  'background': ['utility/functional/bg'],
  'radius': ['utility/functional/rounded'],
  'border': ['utility/functional/border', 'utility/static/border-solid'],
  'opacity': ['utility/functional/opacity'],
  'text-size': ['utility/functional/text'],
  'text-color': ['utility/functional/text'],
  'arbitrary-property': ['syntax/property'],
  'typed-variable': ['utility/functional/w', 'syntax/variable-short'],
  'math': ['utility/functional/w', 'syntax/math'],
  'important': ['syntax/important-after'],
  'dynamic-width': ['runtime/dynamic-class'],
}

export function weappCoverageGaps(inventory: TailwindInventory, fixtures: readonly CaseContract[]): CaseContract[] {
  const covered = new Set(fixtures.flatMap(item => item.features))
  return [...inventory.utilities, ...inventory.variants].filter(feature => !covered.has(feature.id)).map(feature => ({
    id: `inventory/${feature.id}`,
    candidate: feature.witness,
    features: [feature.id],
    fixture: 'missing-weapp-runtime-fixture',
    expectation: { support: 'supported', stage: 'runtime' },
    requiredAssertions: ['runtime'],
    expectedValues: { runtime: true },
  }))
}
