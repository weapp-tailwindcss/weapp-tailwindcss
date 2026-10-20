import { additionalCases } from './additional'
import { layoutCases } from './layout'
import { motionCases } from './motion'
import { syntaxCases } from './syntax'
import { visualCases } from './visual'

export const compatibilityCases = [
  ...layoutCases,
  ...visualCases,
  ...motionCases,
  ...syntaxCases,
  ...additionalCases,
]

export const compatibilityPages = [
  { id: 'overview', label: '总览' },
  { id: 'layout', label: '布局' },
  { id: 'visual', label: '排版与视觉' },
  { id: 'motion', label: '变换与交互' },
  { id: 'variants', label: 'Variants' },
  { id: 'syntax', label: '任意值与指令' },
] as const

export type CompatibilityPageId = typeof compatibilityPages[number]['id']
