import type { LifecycleId } from './types'

export const lifecycleWebProbes = [
  { id: 'lifecycle-starting', candidate: 'starting:opacity-0', features: ['variant/static/starting'] },
  { id: 'lifecycle-details-content', candidate: 'details-content:bg-[#123456]', features: ['variant/static/details-content'] },
] as const

export type LifecycleProbe = typeof lifecycleWebProbes[number]
export const lifecycleWebCandidates = lifecycleWebProbes.map(probe => probe.candidate)

// 这里只声明布局、对照底色和过渡参数；候选的状态样式必须由生成器提供。
export const lifecycleWebFixtureCss = `@import "tailwindcss" source(none);
@layer base {
  html { font-size:16px; background:white; }
  body { margin:24px; background:white; color:black; }
  #host { display:flex; gap:24px; }
  #probe-slot,#control-slot { width:160px; height:160px; }
  [data-starting] { width:160px; height:64px; background:#123456; opacity:1; transition:opacity 1200ms linear; }
  details { width:160px; }
  summary { height:32px; line-height:32px; background:white; }
  [data-details-content] { width:160px; height:64px; background:transparent; }
}`

export function lifecycleFixtureUrl(runId: string, id: LifecycleId) {
  if (!runId) {
    throw new Error('生命周期夹具缺少本轮 run ID')
  }
  return `https://tailwind-capabilities.invalid/${encodeURIComponent(runId)}/${id}`
}

export function renderLifecycleProbe(probe: LifecycleProbe, css: string, runId: string) {
  const escape = (value: string) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;')
  const details = (id: string, candidate = '') => `<div id="${id}-slot"><details id="${id}" class="${escape(candidate)}"><summary id="${id}-summary">Native details</summary><div id="${id}-content" data-details-content></div></details></div>`
  const html = probe.id === 'lifecycle-starting'
    ? `<div id="host"></div><template id="starting-template"><div id="probe" data-starting class="${escape(probe.candidate)}"></div><div id="control" data-starting></div></template>`
    : `<div id="host">${details('probe', probe.candidate)}${details('control')}</div>`
  return `<!doctype html><html><head><meta charset="UTF-8"><style>${css}</style></head><body data-lifecycle-fixture="${probe.id}" data-run-id="${escape(runId)}">${html}</body></html>`
}
