export const hmrCss = '@import "tailwindcss" source(none);\n@source "./probe.js";\n@layer base { #probe { width:80px; height:40px; background:#123456; } }'

export const hmrIcon = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path fill="#123456" d="M0 0h1v1H0z"/></svg>'
export const hmrPage = '<!doctype html><html><head><meta name="tailwind-instance" content="__TAILWIND_INSTANCE__"><link rel="icon" href="/favicon.svg" type="image/svg+xml"></head><body><script type="module" src="/probe.js"></script></body></html>'

export const hmrStates = [
  { id: 'initial', candidate: '', width: 80 },
  { id: 'added', candidate: 'w-[123px]', width: 123 },
  { id: 'replaced', candidate: 'w-[147px]', width: 147 },
  { id: 'deleted', candidate: '', width: 80 },
] as const

/** 候选只存在于真实源码；保存标识与样式在同一次写入中更新。 */
export function hmrSource(runId: string, state: typeof hmrStates[number]) {
  return `import './entry.css'\nconst node = document.createElement('div')\nnode.id = 'probe'\nnode.className = ${JSON.stringify(state.candidate)}\nnode.dataset.stage = ${JSON.stringify(`${runId}/${state.id}`)}\nnode.textContent = 'Tailwind HMR'\ndocument.body.replaceChildren(node)\nif (import.meta.hot) import.meta.hot.accept()\n`
}
