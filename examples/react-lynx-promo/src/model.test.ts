import { describe, expect, it } from 'vitest'
import { creatorProfile, pipelineSteps } from './model'

describe('promo dashboard model', () => {
  it('keeps the creator identity and content fixed while styles change', () => {
    expect(creatorProfile).toEqual({
      name: 'sonofmagic',
      project: 'weapp-tailwindcss',
      detail: 'Tailwind CSS × Lynx',
      caption: 'Style with utility classes',
    })
  })

  it('describes the actual source, style plugin, and native output', () => {
    expect(pipelineSteps.map(step => step.id)).toEqual(['source', 'styles', 'bundle'])
    expect(pipelineSteps.map(step => step.detail)).toEqual([
      'TypeScript + TSX',
      '@weapp-tailwindcss/lynx',
      'Rspeedy + Lynx encoder',
    ])
  })
})
