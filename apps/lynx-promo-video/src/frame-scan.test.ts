import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execa } from 'execa'
import { describe, expect, it } from 'vitest'
import { assertNoSuspiciousFrames, FRAME_SCAN, inspectVideoFrames, scanGrayFrames } from '../scripts/media/frame-scan'

const frameBytes = FRAME_SCAN.width * FRAME_SCAN.height

async function* grayFrames(values: Iterable<number>, splitAt?: number) {
  for (const value of values) {
    const frame = Buffer.alloc(frameBytes, value)
    if (splitAt === undefined) {
      yield frame
    }
    else {
      yield frame.subarray(0, splitAt)
      yield frame.subarray(splitAt)
    }
  }
}

async function createVideo(file: string, filter: string) {
  await execa('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=192x108:r=30',
    '-vf',
    filter,
    '-frames:v',
    '2250',
    '-c:v',
    'libx264',
    '-preset',
    'ultrafast',
    '-crf',
    '0',
    '-pix_fmt',
    'yuv420p',
    '-threads',
    '1',
    '-y',
    file,
  ])
}

describe('complete frame scan', () => {
  it('detects an isolated corrupt frame between stable frames even across pipe chunk boundaries', async () => {
    const result = await scanGrayFrames(grayFrames([20, 20, 255, 20, 20], 123), 5, 30)
    expect(result.frameCount).toBe(5)
    expect(result.suspiciousFrames).toEqual([
      { frame: 2, timeSeconds: 2 / 30, previousDifference: 235, nextDifference: 235, neighborDifference: 0 },
    ])
    expect(() => assertNoSuspiciousFrames(result, 'final.mp4')).toThrow('必须逐帧复核')
  })

  it('accepts a normal persistent scene cut and gradual motion', async () => {
    for (const values of [[20, 20, 255, 255, 255], [20, 30, 40, 50, 60]]) {
      const result = await scanGrayFrames(grayFrames(values), values.length, 30)
      expect(result.suspiciousFrames).toEqual([])
      expect(() => assertNoSuspiciousFrames(result, 'final.mp4')).not.toThrow()
    }
  })

  it('uses strict mean gray difference thresholds', async () => {
    expect((await scanGrayFrames(grayFrames([0, 10, 0]), 3, 30)).suspiciousFrames).toHaveLength(0)
    expect((await scanGrayFrames(grayFrames([0, 20, 3]), 3, 30)).suspiciousFrames).toHaveLength(0)
    expect((await scanGrayFrames(grayFrames([0, 11, 0]), 3, 30)).suspiciousFrames).toHaveLength(1)
  })

  it('checks the last complete three-frame window and requires all 2250 frames', async () => {
    const values = Array.from({ length: 2250 }, (_, frame) => frame === 2248 ? 255 : 20)
    const result = await scanGrayFrames(grayFrames(values), 2250, 30)
    expect(result.frameCount).toBe(2250)
    expect(result.suspiciousFrames.map(frame => frame.frame)).toEqual([2248])
    for (const count of [2249, 2251]) {
      await expect(scanGrayFrames(grayFrames(Array.from<number>({ length: count }).fill(20)), 2250, 30)).rejects.toThrow(`${count} 帧，必须准确为 2250 帧`)
    }
  })

  it('rejects an incomplete tail frame and failures in the decoded byte stream', async () => {
    async function* incomplete() {
      yield* grayFrames([20, 20, 20])
      yield Buffer.alloc(15)
    }
    async function* failed() {
      yield* grayFrames([20, 20, 20])
      throw new Error('decoded stream failed')
    }
    await expect(scanGrayFrames(incomplete(), 3, 30)).rejects.toThrow('不完整尾帧')
    await expect(scanGrayFrames(failed(), 3, 30)).rejects.toThrow('decoded stream failed')
    await expect(scanGrayFrames(grayFrames([20]), 1, 30)).rejects.toThrow('至少三帧')
  })

  it('fully decodes a 75-second video and catches a flash between one-second sample points', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx frame scan '))
    try {
      const file = path.join(directory, 'one bad frame.mp4')
      await createVideo(file, 'drawbox=color=white:t=fill:enable=\'eq(n,1605)\'')
      const result = await inspectVideoFrames(file, 2250, 30)
      expect(result.frameCount).toBe(2250)
      expect(result.suspiciousFrames.map(frame => [frame.frame, frame.timeSeconds])).toEqual([[1605, 53.5]])
      expect(() => assertNoSuspiciousFrames(result, file)).toThrow('可疑孤立闪帧')
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  }, 15_000)

  it('fully decodes a normal scene cut and fails when FFmpeg cannot decode a source', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'lynx frame decode '))
    try {
      const file = path.join(directory, 'normal scene cut.mp4')
      await createVideo(file, 'drawbox=color=white:t=fill:enable=\'gte(n,1605)\'')
      const result = await inspectVideoFrames(file, 2250, 30)
      expect(result.frameCount).toBe(2250)
      expect(result.suspiciousFrames).toHaveLength(0)
      const corrupt = path.join(directory, 'corrupt.mp4')
      await fs.writeFile(corrupt, 'not a video')
      await expect(inspectVideoFrames(corrupt, 2250, 30)).rejects.toThrow('逐帧解码失败')
    }
    finally {
      await fs.rm(directory, { recursive: true, force: true })
    }
  }, 15_000)
})
