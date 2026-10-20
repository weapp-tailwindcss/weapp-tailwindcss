import type { WebControl } from '../controls'
import { variantElement, variantProbe } from './shared'

const structuralCases = [
  { root: 'first', position: 'before', before: 1, after: 0 },
  { root: 'last', position: 'after', before: 1, after: 0 },
  { root: 'only', position: 'after', before: 1, after: 0 },
  { root: 'odd', position: 'before', before: 1, after: 0 },
  { root: 'even', position: 'before', before: 0, after: 1 },
  { root: 'first-of-type', position: 'before', before: 1, after: 0 },
  { root: 'last-of-type', position: 'after', before: 1, after: 0 },
  { root: 'only-of-type', position: 'after', before: 1, after: 0 },
  { root: 'nth', value: '3', position: 'before', before: 0, after: 2 },
  { root: 'nth-last', value: '3', position: 'after', before: 0, after: 2 },
  { root: 'nth-of-type', value: '3', position: 'before', before: 0, after: 2 },
  { root: 'nth-last-of-type', value: '3', position: 'after', before: 0, after: 2 },
] as const

export const structuralVariantProbes = [
  ...structuralCases.map((item) => {
    const functional = 'value' in item
    const html = item.root.includes('of-type')
      ? `<section><span>unrelated type before</span>${variantElement}<span>unrelated type after</span></section>`
      : `<section>${variantElement}</section>`
    const control: WebControl = { kind: 'siblings', selector: '#probe', key: item.root, tag: 'div', position: item.position, before: item.before, after: item.after }
    return variantProbe(`controlled-${item.root}`, functional ? `${item.root}-${item.value}` : item.root, [`variant/${functional ? 'functional' : 'static'}/${item.root}`], [control], html)
  }),
  variantProbe('controlled-empty', 'empty', ['variant/static/empty'], [{ kind: 'text', selector: '#probe', before: 'not empty', after: '' }]),
]
