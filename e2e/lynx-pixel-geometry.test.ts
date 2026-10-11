import { expect, it } from 'vitest'
import { skewImage } from './lynx/fixtures/skew-images'
import { evaluatePixelEffect } from './lynx/pixel-effects'

it.each([1, 2.625, 3])('在 %s 倍画布验证双轴 skew，允许实际 Canvas 绘制路径的亚像素差异', (scale) => {
  for (const transform of ['skew', 'canvas'] as const) {
    expect(evaluatePixelEffect('transform-skew', skewImage(scale, transform), skewImage(scale, 'identity'))).toMatchObject({ status: 'supported', checkpoints: [{ name: 'geometry:expected-effect-v1', passed: true }] })
  }
})

it.each(['identity', 'translate', 'scale', 'rotate', 'only-x', 'only-y', 'reverse', 'wrong-angle'] as const)('完整主体的 %s 不能冒充双轴 skew', (transform) => {
  for (const scale of [1, 2.625, 3]) {
    expect(evaluatePixelEffect('transform-skew', skewImage(scale, transform), skewImage(scale, 'identity'))?.status).toBe('unsupported')
  }
})

it('空主体、坏对照、透明画布与主体空洞拒绝形成结论', () => {
  const missing = skewImage(1, 'identity')
  missing.data.fill(255)
  expect(() => evaluatePixelEffect('transform-skew', missing, skewImage(1, 'identity'))).toThrow()
  expect(() => evaluatePixelEffect('transform-skew', skewImage(1), skewImage(1, 'translate'))).toThrow()
  const transparent = skewImage(1)
  transparent.data[3] = 0
  expect(() => evaluatePixelEffect('transform-skew', transparent, skewImage(1, 'identity'))).toThrow()
  const hole = skewImage(1)
  hole.data.set([247, 250, 251, 255], (80 * hole.width + 80) * 4)
  expect(() => evaluatePixelEffect('transform-skew', hole, skewImage(1, 'identity'))).toThrow()
})
