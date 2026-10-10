import { decodedIdentifier } from './names'
import data from './property-data.json'

const propertyLonghands: Record<string, string[]> = data

const aliases: Record<string, string> = {
  'grid-gap': 'gap',
  'grid-row-gap': 'row-gap',
  'grid-column-gap': 'column-gap',
  'word-wrap': 'overflow-wrap',
  'page-break-before': 'break-before',
  'page-break-after': 'break-after',
  'page-break-inside': 'break-inside',
}

const resetShorthands = new Set(['border', 'font', 'mask', 'animation'])

export function affectedProperties(property: string): string[] {
  const decoded = decodedIdentifier(property)
  if (decoded.startsWith('--')) {
    return [decoded]
  }
  const unprefixed = decoded.toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, '')
  const name = Object.hasOwn(aliases, unprefixed) ? aliases[unprefixed]! : unprefixed
  if (name === 'all' || resetShorthands.has(name) || /(?:^|-)(?:block|inline)(?:-|$)|^border-(?:start|end)-(?:start|end)-radius$/.test(name)) {
    return ['*']
  }
  return Object.hasOwn(propertyLonghands, name) ? propertyLonghands[name]! : ['*']
}
