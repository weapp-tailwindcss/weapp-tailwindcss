import type { PNG } from 'pngjs'
import type { WeappRect } from './types'
import { digest } from '../identity'

const colors = [[32, 64, 96, 255], [224, 128, 32, 255]] as const

/** 标记绑定本轮、案例、阶段和实际样式，拒绝旧图重新签名后复用。 */
export function weappMarker(runId: string, caseId: string, phase: string, cssHash: string) {
  const hash = digest({ runId, caseId, phase, cssHash })
  const bits = [...hash.slice(0, 32)].flatMap(hex => Number.parseInt(hex, 16).toString(2).padStart(4, '0').split('').map(Number))
  return { hash, bits, colors: bits.map(bit => `rgb(${colors[bit]!.slice(0, 3).join(',')})`) }
}

export function verifyWeappMarker(image: PNG, viewportWidth: number, rect: WeappRect, marker: ReturnType<typeof weappMarker>) {
  const scale = image.width / viewportWidth
  if (![rect.left, rect.top, rect.width, rect.height, scale].every(Number.isFinite)
    || Math.abs(rect.width - 64) > 0.01 || Math.abs(rect.height - 32) > 0.01 || scale <= 0
    || rect.left < 0 || rect.top < 0 || (rect.left + rect.width) * scale > image.width + 0.01 || (rect.top + rect.height) * scale > image.height + 0.01) {
    throw new Error('微信截图缺少有效标记几何')
  }
  for (const [index, bit] of marker.bits.entries()) {
    const x = Math.floor((rect.left + (index % 16 + 0.5) * 4) * scale)
    const y = Math.floor((rect.top + (Math.floor(index / 16) + 0.5) * 4) * scale)
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) {
      throw new Error('微信标记超出视口')
    }
    const offset = (y * image.width + x) * 4
    if (colors[bit]!.some((value, channel) => Math.abs(value - image.data[offset + channel]!) > (channel < 3 ? 1 : 0))) {
      throw new Error('微信截图标记与本轮案例/阶段不匹配')
    }
  }
}
