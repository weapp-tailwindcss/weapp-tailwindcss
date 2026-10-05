import fs from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PNG } from 'pngjs'
import { describe, expect, it, vi } from 'vitest'
import { captureMiniProgramScreenshot } from '../scripts/demo-visual-e2e-report/mini-program-screenshot'

const metrics = { screenWidth: 375, screenHeight: 667, screenTop: 64, windowWidth: 375, windowHeight: 603 }
const corruptPng = PNG.sync.write(new PNG({ width: 1, height: 1 }))
corruptPng.writeUInt32BE(0, 29)

describe('full mini-program screenshot evidence', () => {
  it('preserves original pixels and runtime geometry without assuming viewport scale', async () => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'weapp-full-screenshot-'))
    try {
      const screenshot = path.join(directory, 'nested', 'rendered.png')
      const image = new PNG({ width: 804, height: 1428 })
      image.data.set([12, 34, 56, 255], 0)
      image.data.set([78, 90, 12, 255], image.data.length - 4)
      const original = PNG.sync.write(image)
      const miniProgram = {
        evaluate: vi.fn().mockResolvedValue(metrics),
        send: vi.fn().mockResolvedValue({ data: original.toString('base64') }),
      }
      const captured = await captureMiniProgramScreenshot(miniProgram, screenshot, 1000)
      expect((await fs.readFile(screenshot)).equals(original)).toBe(true)
      expect(captured.data.equals(image.data)).toBe(true)
      expect(JSON.parse(await fs.readFile(`${screenshot}.capture.json`, 'utf8'))).toEqual({
        kind: 'full-screen',
        image: { width: 804, height: 1428 },
        runtime: metrics,
      })
      expect(miniProgram.send).toHaveBeenCalledExactlyOnceWith('App.captureScreenshot', {}, { timeout: 1000 })
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    ['missing image', {}],
    ['empty image', { data: '' }],
    ['invalid PNG', { data: 'bm90IGEgcG5n' }],
    ['invalid CRC', { data: corruptPng.toString('base64') }],
  ])('rejects %s without writing successful screenshot evidence', async (_, response) => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'weapp-full-screenshot-'))
    try {
      const miniProgram = { evaluate: vi.fn().mockResolvedValue(metrics), send: vi.fn().mockResolvedValue(response) }
      await expect(captureMiniProgramScreenshot(miniProgram, path.join(directory, 'failed.png'), 1000)).rejects.toThrow()
      expect(await fs.readdir(directory)).toEqual([])
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it.each(['geometry', 'capture'])('propagates %s failures without synthetic evidence', async (stage) => {
    const directory = await fs.mkdtemp(path.join(tmpdir(), 'weapp-full-screenshot-'))
    try {
      const failure = new Error('Connection closed')
      const miniProgram = {
        evaluate: stage === 'geometry' ? vi.fn().mockRejectedValue(failure) : vi.fn().mockResolvedValue(metrics),
        send: vi.fn().mockRejectedValue(failure),
      }
      await expect(captureMiniProgramScreenshot(miniProgram, path.join(directory, 'failed.png'), 1000)).rejects.toBe(failure)
      if (stage === 'geometry') {
        expect(miniProgram.send).not.toHaveBeenCalled()
      }
      expect(await fs.readdir(directory)).toEqual([])
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  })

  it.each([
    { screenTop: -1 },
    { windowHeight: 668 },
    { windowWidth: 376 },
  ])('rejects invalid runtime bounds %j before capture', async (invalid) => {
    const miniProgram = { evaluate: vi.fn().mockResolvedValue({ ...metrics, ...invalid }), send: vi.fn() }
    await expect(captureMiniProgramScreenshot(miniProgram, 'unused.png', 1000)).rejects.toThrow('有效的窗口几何信息')
    expect(miniProgram.send).not.toHaveBeenCalled()
  })
})
