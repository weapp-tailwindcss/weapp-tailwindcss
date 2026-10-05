import type { NativeCaseResult } from '../../../examples/react-lynx/src/compatibility/types'
import { PNG } from '../png'

/** 仅用于像素协议的合成字形，不作为原生支持证据。 */
export function darkImage(scale = 1, kind: 'ink' | 'white' | 'missing' | 'red' | 'shifted' | 'background' = 'ink') {
  const image = new PNG({ width: Math.round(160 * scale), height: Math.round(160 * scale) })
  for (let index = 0; index < image.width * image.height; index++) {
    const x = (index % image.width + 0.5) / scale
    const y = (Math.floor(index / image.width) + 0.5) / scale
    const panel = x >= 32 && x < 128 && y >= 40 && y < 120
    const letterX = kind === 'shifted' ? x - 12 : x
    const glyph = kind !== 'missing' && y >= 68 && y < 92 && ((letterX >= 54 && letterX < 58) || (letterX >= 70 && letterX < 74) || (letterX >= 86 && letterX < 90) || (y < 72 && letterX >= 54 && letterX < 104))
    const color = glyph ? (kind === 'white' || kind === 'shifted' ? [255, 255, 255] : kind === 'red' ? [255, 0, 0] : [19, 32, 38]) : panel ? (kind === 'background' ? [255, 255, 255] : [14, 165, 233]) : [247, 250, 251]
    image.data.set([...color, 255], index * 4)
  }
  return image
}

export function darkReceipts(runId: string): NativeCaseResult['colorScheme'] {
  return {
    light: { runId, requestId: 'color-scheme-1', scheme: 'light' },
    dark: { runId, requestId: 'color-scheme-2', scheme: 'dark' },
    restored: { runId, requestId: 'color-scheme-3', scheme: 'light' },
  }
}
