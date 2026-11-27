import type { Declaration, Root } from 'postcss'
import valueParser from 'postcss-value-parser'

const modernLengthUnits = new Set([
  'dvh',
  'dvw',
  'dvi',
  'dvb',
  'dvmin',
  'dvmax',
  'svh',
  'svw',
  'svi',
  'svb',
  'svmin',
  'svmax',
  'lvh',
  'lvw',
  'lvi',
  'lvb',
  'lvmin',
  'lvmax',
  'cqw',
  'cqh',
  'cqi',
  'cqb',
  'cqmin',
  'cqmax',
])

const viewportFallbacks: Readonly<Record<string, string>> = {
  dvh: 'vh',
  dvw: 'vw',
  dvmin: 'vmin',
  dvmax: 'vmax',
  svh: 'vh',
  svw: 'vw',
  svmin: 'vmin',
  svmax: 'vmax',
  lvh: 'vh',
  lvw: 'vw',
  lvmin: 'vmin',
  lvmax: 'vmax',
}

function getModernLengthUnit(value: string) {
  const match = /^([+-]?(?:\d*\.)?\d+(?:e[+-]?\d+)?)([a-z]+)$/i.exec(value)
  const unit = match?.[2]?.toLowerCase()
  return unit && modernLengthUnits.has(unit) ? { number: match![1]!, unit } : undefined
}

function analyzeModernUnits(value: string) {
  const parsed = valueParser(value)
  let changed = false
  let found = false
  let unsafe = false
  parsed.walk((node) => {
    if (node.type !== 'word') {
      return
    }
    const parsedUnit = getModernLengthUnit(node.value)
    if (!parsedUnit) {
      return
    }
    found = true
    const fallback = viewportFallbacks[parsedUnit.unit]
    if (!fallback) {
      unsafe = true
      return
    }
    node.value = `${parsedUnit.number}${fallback}`
    changed = true
  })
  return { value: changed ? parsed.toString() : value, changed, found, unsafe }
}

function hasEquivalentFallback(declaration: Declaration, value: string) {
  const parent = declaration.parent
  if (!parent || !('nodes' in parent)) {
    return false
  }
  return parent.nodes.some(node => node.type === 'decl'
    && node !== declaration
    && node.prop === declaration.prop
    && node.value === value
    && node.important === declaration.important)
}

export function hasModernLengthUnit(value: string) {
  return analyzeModernUnits(value).found
}

export function modernLengthUnitsInValue(value: string) {
  const units = new Set<string>()
  valueParser(value).walk((node) => {
    if (node.type !== 'word') {
      return
    }
    const parsed = getModernLengthUnit(node.value)
    if (parsed) {
      units.add(parsed.unit)
    }
  })
  return [...units]
}

export function lowerModernLengthUnitFallbacks(root: Root) {
  const approximate: Declaration[] = []
  const unsafe: Declaration[] = []
  root.walkDecls((declaration) => {
    const fallback = analyzeModernUnits(declaration.value)
    if (fallback.unsafe || (declaration.prop.startsWith('--') && fallback.changed)) {
      unsafe.push(declaration)
    }
    else if (fallback.changed) {
      approximate.push(declaration)
      if (!hasEquivalentFallback(declaration, fallback.value)) {
        declaration.cloneBefore({ value: fallback.value })
      }
    }
  })
  return { approximate, unsafe }
}

export function removeModernLengthUnitDeclarations(root: Root) {
  root.walkDecls((declaration) => {
    if (hasModernLengthUnit(declaration.value)) {
      declaration.remove()
    }
  })
}

export function normalizeModernLengthUnitValue(value: string) {
  return analyzeModernUnits(value)
}
