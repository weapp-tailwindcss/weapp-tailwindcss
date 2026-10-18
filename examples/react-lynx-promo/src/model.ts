export const buildStatus = {
  label: 'Bundle ready',
  detail: 'main.lynx.bundle',
  target: 'ReactLynx',
} as const

export const pipelineSteps = [
  { id: 'source', label: 'ReactLynx components', detail: 'TypeScript + TSX', stage: 'SOURCE' },
  { id: 'styles', label: 'Tailwind utilities', detail: '@weapp-tailwindcss/lynx', stage: 'STYLES' },
  { id: 'bundle', label: 'Native bundle', detail: 'Rspeedy + Lynx encoder', stage: 'OUTPUT' },
] as const
