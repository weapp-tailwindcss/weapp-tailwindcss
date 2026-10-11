import assert from 'node:assert/strict'
import { isWeb } from './catalog.mjs'

export function authoredClasses(round) {
  return {
    height: `tw-authored-height-${round === 'replace' || round === 'add' ? 'large' : 'small'}`,
    display: 'tw-authored-display',
    color: 'tw-authored-color',
    ...(round === 'add' ? { added: 'tw-authored-added' } : {}),
  }
}

export function authoredValues(item, round) {
  const unit = isWeb(item) ? 'rem' : 'rpx'
  return { height: `${round === 'replace' || round === 'add' ? 12 : 8}${unit}`, display: 'flex', color: '#123456', ...(round === 'add' ? { added: `9${unit}` } : {}) }
}

export function authoredCss(item, round) {
  const values = authoredValues(item, round)
  return Object.entries(authoredClasses(round)).map(([key, name]) => `.${name}{${key === 'added' ? 'width' : key}:${values[key]}}`).join('\n')
}

export function inspectAuthored(result, item, round) {
  const values = authoredValues(item, round)
  for (const [key, name] of Object.entries(authoredClasses(round))) {
    assert.ok(result[name]?.includes(values[key]), `${item.id}: injected ${name} must equal ${values[key]}`)
  }
  return { rules: result, coverage: 'authored-styles' }
}
