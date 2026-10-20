import { describe, expect, it } from 'vitest'
import { responsiveFixture, responsiveImage } from './lynx/fixtures/responsive-images'
import { evaluateResponsive, validateResponsiveFrames } from './lynx/responsive'

describe('Lynx 真实根 viewport 响应式合同', () => {
  it.each([1, 2, 3])('逐像素及独立几何验证窄→宽→窄→恢复，scale=%s', (scale) => {
    for (const originalWidth of [390, 1000]) {
      const { frames, images } = responsiveFixture(undefined, scale, originalWidth)
      expect(evaluateResponsive(frames, images, frames.narrow.runId).status).toBe('supported')
    }
  })

  it.each(['old-single-viewport', 'parent-only', 'requested-only', 'duplicate-request', 'wrong-run', 'wrong-phase', 'missing-restore', 'not-restored', 'adaptive-rem', 'missing-marker', 'scale-drift'] as const)('拒绝 %s', (mode) => {
    const { frames } = responsiveFixture()
    if (mode === 'old-single-viewport') {
      delete (frames as Partial<typeof frames>).wide
    }
    if (mode === 'parent-only') {
      frames.wide.viewport.width = frames.wide.viewport.measuredWidth = 384
    }
    if (mode === 'requested-only') {
      frames.wide.viewport.measuredWidth = 384
    }
    if (mode === 'duplicate-request') {
      frames.wide.requestId = frames.narrow.requestId
    }
    if (mode === 'wrong-run') {
      frames.wide.runId = 'old-run'
    }
    if (mode === 'wrong-phase') {
      frames.wide.phase = 'narrow'
    }
    if (mode === 'missing-restore') {
      delete (frames as Partial<typeof frames>).restored
    }
    if (mode === 'not-restored') {
      frames.restored.viewport.width = frames.restored.viewport.measuredWidth = 384
    }
    if (mode === 'adaptive-rem') {
      frames.wide.threshold.width = frames.wide.threshold.right = 1920
    }
    if (mode === 'missing-marker') {
      delete (frames.wide as Partial<typeof frames.wide>).threshold
    }
    if (mode === 'scale-drift') {
      frames.wide.viewport.pixelRatio = 2
    }
    expect(() => validateResponsiveFrames(frames, frames.narrow.runId)).toThrow()
  })

  it('节点可见且旧单视口宽度正确仍不能通过全部状态', () => {
    const { frames, images } = responsiveFixture()
    frames.wide.geometry.probe.width = 200
    frames.wide.geometry.probe.right = 216
    images.wide.probe = responsiveImage(200)
    expect(evaluateResponsive(frames, images, frames.narrow.runId).status).toBe('unsupported')
  })

  it.each(['old-png', 'missing-png', 'wrong-color', 'control-drift', 'wrong-anchor', 'partial-height'] as const)('拒绝 %s 的可见节点证据', (mode) => {
    const { frames, images } = responsiveFixture()
    if (mode === 'old-png') {
      images.wide.probe = images.narrow.probe
    }
    if (mode === 'missing-png') {
      images.restored.probe = undefined as never
    }
    if (mode === 'wrong-color') {
      images.wide.probe.data[4 * (30 * 240 + 30)] = 255
    }
    if (mode === 'control-drift') {
      frames.wide.geometry.control.width = 100
      frames.wide.geometry.control.right = 116
    }
    if (mode === 'wrong-anchor') {
      frames.wide.geometry.probe.left = 20
      frames.wide.geometry.probe.right += 4
    }
    if (mode === 'partial-height') {
      frames.wide.geometry.probe.height = 20
      frames.wide.geometry.probe.bottom = 36
    }
    expect(() => evaluateResponsive(frames, images, frames.narrow.runId)).toThrow()
  })
})
