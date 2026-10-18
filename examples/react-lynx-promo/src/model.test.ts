import { describe, expect, it } from 'vitest'
import { buildStatus, pipelineSteps } from './model'

describe('promo dashboard model', () => {
  it('keeps the recording at the bundle result without simulated progress', () => {
    expect(buildStatus).toEqual({
      label: 'Bundle ready',
      detail: 'main.lynx.bundle',
      target: 'ReactLynx',
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
