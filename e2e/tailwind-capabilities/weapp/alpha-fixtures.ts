import type { Rgba, WeappPhase, WeappProbe } from './types'
import { miniProgramRuntimeColorWeightLimit } from '@weapp-tailwindcss/test-catalog'

export const weappFixtureCss = [
  '@import "tailwindcss" source(none);',
  '@theme inline{--color-alpha-solid:rgb(255,0,0);--color-alpha-translucent:rgba(255,0,0,.4)}',
  ':root{--alpha-weight-zero:0%;--alpha-weight-quarter:25%;--alpha-weight-half:50%;--alpha-weight-alias:var(--alpha-weight-half);--alpha-weight-full:100%;--alpha-weight-fraction:12.5%}',
].join('\n')

const size = 'width:80px;height:48px;min-height:0'
const color = (alpha: string) => alpha === '1' ? 'rgb(255, 0, 0)' : `rgba(255, 0, 0, ${alpha})`
function redPhase(name: string, candidate: string, alpha: string, pixel: Rgba): WeappPhase {
  return { name, candidates: [candidate], inline: size, reference: `${size};background-color:${color(alpha)}`, expected: { 'background-color': color(alpha) }, pixel: { actual: pixel, reference: pixel, equal: true } }
}
function redProbe(id: string, candidate: string, alpha: string, pixel: Rgba): WeappProbe {
  const phase = redPhase('default', candidate, alpha, pixel)
  return { id, candidates: [candidate], property: 'background-color', expected: color(alpha), reference: phase.reference, empty: true, phases: [phase] }
}

const quarter: Rgba = [255, 191, 191, 255]
const half: Rgba = [255, 128, 128, 255]
const fallback: Rgba = [0, 165, 234, 255]
const limit = miniProgramRuntimeColorWeightLimit
const limitPhases: WeappPhase[] = [
  { name: 'before', weight: '50%', alpha: '0.5', pixel: [128, 210, 245, 255] as Rgba },
  { name: 'after', weight: '25%', alpha: '0.25', pixel: [191, 233, 250, 255] as Rgba },
  { name: 'restored', weight: '50%', alpha: '0.5', pixel: [128, 210, 245, 255] as Rgba },
].map(state => ({
  name: state.name,
  candidates: [limit.candidate],
  inline: `${size};--my-alpha-value:${state.weight}`,
  reference: `${size};background-color:rgba(0,165,234,${state.alpha})`,
  expected: { 'background-color': 'rgb(0, 165, 234)' },
  referenceExpected: { 'background-color': `rgba(0, 165, 234, ${state.alpha})` },
  witness: { inline: `--my-alpha-value:${state.weight};opacity:var(--my-alpha-value)`, expected: { opacity: state.alpha } },
  pixel: { actual: fallback, reference: state.pixel, equal: false },
}))

export const alphaProbes: readonly WeappProbe[] = [
  redProbe('alpha-zero', 'bg-alpha-solid/0', '0', [255, 255, 255, 255]),
  redProbe('alpha-quarter', 'bg-alpha-solid/25', '0.25', quarter),
  redProbe('alpha-half', 'bg-alpha-solid/50', '0.5', half),
  redProbe('alpha-full', 'bg-alpha-solid/100', '1', [255, 0, 0, 255]),
  redProbe('alpha-fraction', 'bg-alpha-solid/[.33]', '0.33', [255, 171, 171, 255]),
  redProbe('alpha-source-translucent', 'bg-alpha-translucent/50', '0.2', [255, 204, 204, 255]),
  redProbe('alpha-static-zero', 'bg-alpha-solid/(--alpha-weight-zero)', '0', [255, 255, 255, 255]),
  redProbe('alpha-static-variable', 'bg-alpha-solid/(--alpha-weight-quarter)', '0.25', quarter),
  redProbe('alpha-static-alias', 'bg-alpha-solid/(--alpha-weight-alias)', '0.5', half),
  redProbe('alpha-static-full', 'bg-alpha-solid/(--alpha-weight-full)', '1', [255, 0, 0, 255]),
  redProbe('alpha-static-fraction', 'bg-alpha-solid/(--alpha-weight-fraction)', '0.125', [255, 223, 223, 255]),
  { id: 'alpha-dynamic-class', candidates: ['bg-alpha-solid/25', 'bg-alpha-solid/50'], property: 'background-color', expected: color('0.25'), reference: `${size};background-color:${color('0.25')}`, empty: true, phases: [redPhase('before', 'bg-alpha-solid/25', '0.25', quarter), redPhase('after', 'bg-alpha-solid/50', '0.5', half), redPhase('restored', 'bg-alpha-solid/25', '0.25', quarter)] },
  { id: 'runtime-color-weight-limit', candidates: [limit.candidate], property: 'background-color', expected: 'rgb(0, 165, 234)', reference: limitPhases[0]!.reference, empty: true, limit: { id: limit.id, reason: limit.reason }, phases: limitPhases },
]
