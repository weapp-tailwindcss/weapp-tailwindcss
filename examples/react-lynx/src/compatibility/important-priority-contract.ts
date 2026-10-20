/** 优先级夹具的独立合同；普通 utility 必须输给 ID 普通声明，important 必须胜出。 */
export const importantPriorityContract = {
  version: 1,
  id: 'syntax-important',
  checkpoint: 'pixel:important-priority-v1',
  frames: ['probe', 'control', 'reference'],
  candidate: '!bg-[#737373]',
  normalCandidate: 'bg-[#737373]',
  layer: 'utilities',
  referenceSelector: '.probe-important-reference',
  competitorSelectors: ['#probe-syntax-important', '#control-syntax-important'],
  expected: '#737373',
  competitor: '#dc2626',
  canvas: '#f7fafb',
  frameSize: 160,
  target: { x: 12, y: 12, width: 96, height: 64 },
  colorTolerance: 2,
} as const
