export const creatorProfile = {
  name: 'sonofmagic',
  project: 'weapp-tailwindcss',
  detail: 'Tailwind CSS × Lynx',
  caption: 'Style with utility classes',
} as const

export const pipelineSteps = [
  { id: 'source', label: 'ReactLynx components', detail: 'TypeScript + TSX', stage: 'SOURCE' },
  { id: 'styles', label: 'Tailwind utilities', detail: '@weapp-tailwindcss/lynx', stage: 'STYLES' },
  { id: 'bundle', label: 'Native bundle', detail: 'Rspeedy + Lynx encoder', stage: 'OUTPUT' },
] as const
