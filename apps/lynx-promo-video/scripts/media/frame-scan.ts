import { Buffer } from 'node:buffer'
import { execa } from 'execa'

export const FRAME_SCAN = { width: 192, height: 108, changeThreshold: 10, neighborThreshold: 3 } as const
const frameBytes = FRAME_SCAN.width * FRAME_SCAN.height

export interface SuspiciousFrame {
  frame: number
  timeSeconds: number
  previousDifference: number
  nextDifference: number
  neighborDifference: number
}

export interface FrameScanResult {
  frameCount: number
  fps: number
  width: number
  height: number
  suspiciousFrames: SuspiciousFrame[]
}

function difference(first: Uint8Array, second: Uint8Array) {
  let total = 0
  for (let index = 0; index < frameBytes; index++) {
    total += Math.abs(first[index] - second[index])
  }
  return total / frameBytes
}

/** 完整消费灰度帧流，使用三帧环形缓冲查找孤立闪帧；首尾帧无法组成完整邻帧。 */
export async function scanGrayFrames(chunks: AsyncIterable<Uint8Array>, expectedFrames: number, fps: number): Promise<FrameScanResult> {
  if (!Number.isInteger(expectedFrames) || expectedFrames < 3 || !Number.isFinite(fps) || fps <= 0) {
    throw new Error('逐帧检查需要有效帧率及至少三帧的准确帧数。')
  }
  const frames = [Buffer.alloc(frameBytes), Buffer.alloc(frameBytes), Buffer.alloc(frameBytes)]
  const suspiciousFrames: SuspiciousFrame[] = []
  let frameCount = 0
  let filled = 0
  for await (const chunk of chunks) {
    let offset = 0
    while (offset < chunk.length) {
      const target = frames[frameCount % 3]
      const count = Math.min(frameBytes - filled, chunk.length - offset)
      target.set(chunk.subarray(offset, offset + count), filled)
      offset += count
      filled += count
      if (filled !== frameBytes) {
        continue
      }
      if (frameCount >= 2) {
        const previous = frames[(frameCount - 2) % 3]
        const current = frames[(frameCount - 1) % 3]
        const previousDifference = difference(previous, current)
        const nextDifference = difference(current, target)
        const neighborDifference = difference(previous, target)
        if (previousDifference > FRAME_SCAN.changeThreshold && nextDifference > FRAME_SCAN.changeThreshold && neighborDifference < FRAME_SCAN.neighborThreshold) {
          suspiciousFrames.push({ frame: frameCount - 1, timeSeconds: (frameCount - 1) / fps, previousDifference, nextDifference, neighborDifference })
        }
      }
      frameCount++
      filled = 0
    }
  }
  if (filled !== 0) {
    throw new Error(`逐帧解码存在 ${filled} 字节的不完整尾帧。`)
  }
  if (frameCount !== expectedFrames) {
    throw new Error(`逐帧解码得到 ${frameCount} 帧，必须准确为 ${expectedFrames} 帧。`)
  }
  return { frameCount, fps, width: FRAME_SCAN.width, height: FRAME_SCAN.height, suspiciousFrames }
}

/** 不补帧、不丢帧、不截断输出，完整解码后核对实际帧数与孤立闪帧。 */
export async function inspectVideoFrames(file: string, expectedFrames: number, fps: number): Promise<FrameScanResult> {
  const decoder = execa('ffmpeg', [
    '-v',
    'error',
    '-xerror',
    '-err_detect',
    'explode',
    '-i',
    file,
    '-map',
    '0:v:0',
    '-an',
    '-sn',
    '-dn',
    '-vf',
    `scale=${FRAME_SCAN.width}:${FRAME_SCAN.height}:flags=area,format=gray`,
    '-fps_mode',
    'passthrough',
    '-f',
    'rawvideo',
    '-pix_fmt',
    'gray',
    'pipe:1',
  ], { encoding: 'buffer', buffer: { stdout: false, stderr: true }, maxBuffer: { stderr: 1024 * 1024 } })
  // 提前监听进程失败，避免在消费 stdout 期间出现未处理的 Promise rejection。
  const completion = decoder.then(() => undefined, error => error as Error)
  let result: FrameScanResult | undefined
  let scanError: unknown
  try {
    result = await scanGrayFrames(decoder.stdout, expectedFrames, fps)
  }
  catch (error) {
    scanError = error
    // 校验异常时继续排空管道，确保子进程结束并获得真实解码错误。
    decoder.stdout.resume()
  }
  const decodeError = await completion
  if (decodeError) {
    throw new Error(`${file} 逐帧解码失败：${decodeError.message}`, { cause: decodeError })
  }
  if (scanError) {
    throw scanError
  }
  return result!
}

export function assertNoSuspiciousFrames(result: FrameScanResult, label: string) {
  if (result.suspiciousFrames.length > 0) {
    throw new Error(`${label} 检出 ${result.suspiciousFrames.length} 个可疑孤立闪帧，必须逐帧复核：${JSON.stringify(result.suspiciousFrames)}`)
  }
}
