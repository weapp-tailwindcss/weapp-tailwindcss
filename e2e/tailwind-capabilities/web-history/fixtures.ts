import { digest } from '../identity'

export const historyProbe = { id: 'history-visited-border', candidate: 'visited:border-[#123456]', features: ['variant/static/visited'] } as const
export const historyStates = ['initial', 'visited', 'restored'] as const
export const historyElements = ['probe', 'control', 'reference'] as const
export const historyCss = '@import "tailwindcss" source(none);\n@layer base { body { margin:24px; } a { display:block; box-sizing:border-box; width:160px; height:40px; border:8px solid #010203; background:white; color:#010203; transition:none; } }'
export const historyReference = '#reference:visited { border-color:#123456; }'

export function historyPaths(runId: string) {
  const prefix = `/${encodeURIComponent(runId)}/${historyProbe.id}`
  return { fixture: `${prefix}/fixture`, target: `${prefix}/target`, control: `${prefix}/unvisited` }
}

/** 标记同时绑定源码产物与浏览器，避免跨状态或跨引擎挪用截图。 */
export function historyIdentity(runId: string, state: string, cssHash: string, engine: string) {
  const hash = digest({ runId, state, cssHash, engine, fixture: historyProbe.id })
  return Array.from({ length: 8 }, (_, index) => [0, 1, 2].map(channel => Number.parseInt(hash.slice(index * 6 + channel * 2, index * 6 + channel * 2 + 2), 16)))
}

export function renderHistory(css: string, runId: string) {
  const paths = historyPaths(runId)
  const escaped = runId.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
  return `<!doctype html><html><head><meta charset="UTF-8"><link rel="icon" href="data:,"><style>${css}</style><style>${historyReference}</style></head><body data-fixture="${historyProbe.id}" data-run-id="${escaped}"><a id="probe" class="${historyProbe.candidate}" href="${paths.target}">History</a><a id="control" href="${paths.control}">History</a><a id="reference" href="${paths.target}">History</a><div id="identity" style="position:absolute;left:24px;top:160px;display:flex;width:32px;height:4px">${Array.from({ length: 8 }).fill('<i style="display:block;width:4px;height:4px"></i>').join('')}</div></body></html>`
}
