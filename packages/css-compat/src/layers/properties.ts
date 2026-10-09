import data from './property-data.json'

const propertyLonghands: Record<string, string[]> = data

const resetShorthands = new Set(['border', 'font', 'mask', 'animation'])

export function affectedProperties(property: string): string[] {
  if (property.startsWith('--')) {
    return [property]
  }
  const name = property.toLowerCase().replace(/^-(?:webkit|moz|ms|o)-/, '')
  if (name === 'all' || resetShorthands.has(name) || /(?:^|-)(?:block|inline)(?:-|$)|^border-(?:start|end)-(?:start|end)-radius$/.test(name)) {
    return ['*']
  }
  return Object.hasOwn(propertyLonghands, name) ? propertyLonghands[name]! : ['*']
}
