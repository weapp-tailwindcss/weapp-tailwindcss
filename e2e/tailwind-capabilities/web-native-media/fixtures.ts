import { fixtureInlineIconLink } from '../browser/resources'

export const nativeMediaProbe = {
  id: 'native-media-contrast-less',
  candidate: 'contrast-less:bg-[#123456]',
  features: ['variant/static/contrast-less'],
  engines: ['chromium'],
} as const

export const nativeMediaStates = ['initial', 'less', 'more', 'custom', 'restored'] as const
export const nativeMediaElements = ['probe', 'control', 'reference'] as const
export const nativeMediaQueries = ['less', 'more', 'no-preference', 'custom'] as const
export const nativeMediaCss = '@import "tailwindcss" source(none);\n@layer base { body { margin:24px; } #probe,#control,#reference { display:block; width:160px; height:40px; background-color:#010203; transition:none; } }'
// 独立对照直接由浏览器解释，不通过 Tailwind 生成器构造预期。
export const nativeMediaReference = '@media (prefers-contrast: less) { #reference { background-color:#123456; } }'

export function nativeMediaUrl(runId: string) {
  return `http://tailwind-native-media.test/${encodeURIComponent(runId)}/${nativeMediaProbe.id}`
}

export function mediaValue(state: typeof nativeMediaStates[number]) {
  return state === 'initial' || state === 'restored' ? 'no-preference' : state
}

export function renderNativeMedia(css: string, runId: string) {
  const escaped = runId.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return `<!doctype html><html><head><meta charset="UTF-8">${fixtureInlineIconLink}<style>${css}</style><style>${nativeMediaReference}</style></head><body data-fixture="${nativeMediaProbe.id}" data-run-id="${escaped}"><div id="probe" class="${nativeMediaProbe.candidate}"></div><div id="control"></div><div id="reference"></div><div id="identity" style="position:absolute;left:24px;top:160px;display:flex;width:32px;height:4px">${Array.from({ length: 8 }).fill('<i style="display:block;width:4px;height:4px"></i>').join('')}</div></body></html>`
}
