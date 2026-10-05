import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it, vi } from 'vitest'
import { captureMiniProgramViewport, cropMiniProgramViewport, readMiniProgramViewportMetrics, readMiniProgramWindowMetrics } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'

describe('mini-program screenshot viewport', () => {
  const metrics = { screenWidth: 100, screenHeight: 200, screenTop: 30, windowWidth: 100, windowHeight: 170 }

  it.each([1, 2, 1.5])('removes native chrome using runtime geometry at scale %s', (scale) => {
    const full = new PNG({ width: 100 * scale, height: 200 * scale })
    const offset = (Math.round(30 * scale) * full.width + Math.round(10 * scale)) * 4
    full.data.set([12, 34, 56, 255], offset)
    const viewport = cropMiniProgramViewport(full, metrics)
    expect(viewport.width).toBe(100 * scale)
    expect(viewport.height).toBe(170 * scale)
    expect([...viewport.data.subarray(Math.round(10 * scale) * 4, Math.round(10 * scale) * 4 + 4)]).toEqual([12, 34, 56, 255])
  })

  it('keeps a custom-navigation viewport with no screen inset', () => {
    const full = new PNG({ width: 100, height: 200 })
    expect(cropMiniProgramViewport(full, { ...metrics, screenTop: 0, windowHeight: 200 }).height).toBe(200)
  })

  it('rejects viewport inference when screenshot scaling cannot be verified', () => {
    const full = new PNG({ width: 804, height: 1428 })
    expect(() => cropMiniProgramViewport(full, {
      screenWidth: 375,
      screenHeight: 667,
      screenTop: 64,
      windowWidth: 375,
      windowHeight: 603,
    })).toThrow('小程序截图尺寸与运行时屏幕比例不一致')
  })

  it('uses the actual top chrome when screenTop also includes a bottom tab bar', () => {
    const full = new PNG({ width: 100, height: 200 })
    full.data.set([12, 34, 56, 255], 30 * full.width * 4)
    const viewport = cropMiniProgramViewport(full, { ...metrics, screenTop: 50, viewportTop: 30, windowHeight: 150 })
    expect(viewport.height).toBe(150)
    expect([...viewport.data.subarray(0, 4)]).toEqual([12, 34, 56, 255])
  })

  it('rejects missing geometry, mismatched aspect ratios and out-of-bounds windows', () => {
    const full = new PNG({ width: 100, height: 200 })
    expect(() => cropMiniProgramViewport(full, { ...metrics, screenTop: Number.NaN })).toThrow()
    expect(() => cropMiniProgramViewport(full, { ...metrics, screenHeight: 300 })).toThrow()
    expect(() => cropMiniProgramViewport(full, { ...metrics, windowWidth: 101 })).toThrow()
    expect(() => cropMiniProgramViewport(full, { ...metrics, windowHeight: 180 })).toThrow()
  })
})

describe('real screenshot evidence', () => {
  it('rejects capture failure without emitting a synthetic image', async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'weapp-screenshot-'))
    try {
      const screenshot = path.join(directory, 'failed.png')
      const miniProgram = {
        evaluate: vi.fn().mockResolvedValue({ screenWidth: 100, screenHeight: 200, screenTop: 30, windowWidth: 100, windowHeight: 170 }),
        currentPage: vi.fn().mockResolvedValue({ send: vi.fn().mockResolvedValue({ properties: [20, 10] }) }),
        send: vi.fn().mockRejectedValue(new Error('capture unavailable')),
      }
      await expect(captureMiniProgramViewport(miniProgram, screenshot, 1000)).rejects.toThrow('capture unavailable')
      await expect(fs.stat(screenshot)).rejects.toThrow()
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })
})

describe('runtime readiness during recompilation', () => {
  it('uses runtime geometry directly when the current route has no native tab bar', async () => {
    const metrics = { screenWidth: 390, screenHeight: 844, screenTop: 91, windowWidth: 390, windowHeight: 753, hasNativeTabBar: false }
    await expect(readMiniProgramViewportMetrics({ evaluate: vi.fn().mockResolvedValue(metrics) }, 1000)).resolves.toEqual(metrics)
  })

  it('reacquires the current page when a rebuild destroys the previous frame', async () => {
    const metrics = { screenWidth: 390, screenHeight: 844, screenTop: 173, windowWidth: 390, windowHeight: 671 }
    const currentPage = vi
      .fn()
      .mockResolvedValueOnce({ send: vi.fn().mockRejectedValue(new Error('page destroyed')) })
      .mockResolvedValue({ send: vi.fn().mockResolvedValue({ properties: [44, 47] }) })
    await expect(readMiniProgramViewportMetrics({ evaluate: vi.fn().mockResolvedValue(metrics), currentPage }, 1000)).resolves.toEqual({ ...metrics, viewportTop: 91 })
    expect(currentPage).toHaveBeenCalledTimes(2)
  })

  it('waits for fresh runtime metrics after the service context reloads', async () => {
    const metrics = { screenWidth: 100, screenHeight: 200, screenTop: 30, windowWidth: 100, windowHeight: 170 }
    const evaluate = vi.fn().mockRejectedValueOnce(new Error('wx is not defined')).mockResolvedValueOnce(undefined).mockResolvedValue(metrics)
    await expect(readMiniProgramWindowMetrics({ evaluate }, 1000)).resolves.toEqual(metrics)
    expect(evaluate).toHaveBeenCalledTimes(3)
  })

  it('fails if no current metrics become available and preserves fatal errors', async () => {
    await expect(readMiniProgramWindowMetrics({ evaluate: vi.fn().mockResolvedValue(undefined) }, 0)).rejects.toThrow('未在限定时间内就绪')
    await expect(readMiniProgramWindowMetrics({ evaluate: vi.fn().mockRejectedValue(new Error('Connection closed')) }, 1000)).rejects.toThrow('Connection closed')
  })
})
