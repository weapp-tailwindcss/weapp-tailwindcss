import type { Buffer } from 'node:buffer'

function fail(): never {
  throw new Error('微信合成证据缺少受支持的有效 RGB ICC')
}

/** 按 ICC 分段公式检查活动区间，不以离散采样猜测曲线是否有效。 */
function assertParametricCurve(tag: Buffer) {
  const form = tag.readUInt16BE(8)
  const count = [1, 3, 4, 5, 7][form]
  if (!count || tag.length !== 12 + count * 4) {
    fail()
  }
  const [gamma, a = 1, b = 0, c = 0, d = 0, e = 0, f = 0] = Array.from({ length: count }, (_, index) => tag.readInt32BE(12 + index * 4) / 65536)
  if (gamma! <= 0 || a <= 0 || (form >= 3 && (c < 0 || d < 0 || d > 1))) {
    fail()
  }
  if (form === 0) {
    return
  }
  const threshold = form <= 2 ? -b / a : d
  const offset = form === 2 ? c : form === 4 ? e : 0
  const lower = (x: number) => form <= 2 ? offset : c * x + (form === 4 ? f : 0)
  const upper = (x: number) => {
    const base = form <= 2 && x === threshold ? 0 : a * x + b
    if (base < 0) {
      fail()
    }
    return base ** gamma! + offset
  }
  const values: number[] = []
  if (threshold > 0) {
    values.push(lower(0), lower(Math.min(1, threshold)))
  }
  if (threshold <= 1) {
    values.push(upper(Math.max(0, threshold)), upper(1))
  }
  if (values.some((value, index) => !Number.isFinite(value) || value < 0 || value > 1 || (index > 0 && value < values[index - 1]!))
    || values[values.length - 1]! <= values[0]!) {
    fail()
  }
}

/** 只接收已登记的普通矩阵/TRC 显示器 profile，避免浏览器静默忽略坏 ICC 后误放行。 */
export function assertWeappRgbProfile(profile: Buffer) {
  if (profile.length < 132 || profile.readUInt32BE(0) !== profile.length
    || ![2, 4].includes(profile[8]!) || profile.toString('ascii', 12, 16) !== 'mntr'
    || profile.toString('ascii', 16, 20) !== 'RGB ' || profile.toString('ascii', 20, 24) !== 'XYZ '
    || profile.toString('ascii', 36, 40) !== 'acsp') {
    fail()
  }
  const count = profile.readUInt32BE(128)
  const end = 132 + count * 12
  if (!count || count > 256 || end > profile.length) {
    fail()
  }
  const tags = new Map<string, Buffer>()
  const ranges: Array<{ start: number, end: number }> = []
  for (let index = 0; index < count; index++) {
    const cursor = 132 + index * 12
    const name = profile.toString('ascii', cursor, cursor + 4)
    const start = profile.readUInt32BE(cursor + 4)
    const size = profile.readUInt32BE(cursor + 8)
    if (tags.has(name) || !['desc', 'cprt', 'rXYZ', 'gXYZ', 'bXYZ', 'wtpt', 'rTRC', 'gTRC', 'bTRC'].includes(name)
      || start % 4 || start < end || size < 8 || start + size > profile.length
      || ranges.some(range => start < range.end && start + size > range.start && (start !== range.start || start + size !== range.end))) {
      fail()
    }
    ranges.push({ start, end: start + size })
    tags.set(name, profile.subarray(start, start + size))
  }
  const xyz = ['rXYZ', 'gXYZ', 'bXYZ', 'wtpt'].map((name) => {
    const tag = tags.get(name)
    if (!tag || tag.length !== 20 || tag.toString('ascii', 0, 4) !== 'XYZ ') {
      fail()
    }
    return [8, 12, 16].map(offset => tag!.readInt32BE(offset) / 65536)
  })
  const [red, green, blue, white] = xyz as [number[], number[], number[], number[]]
  const determinant = red[0]! * (green[1]! * blue[2]! - blue[1]! * green[2]!) - green[0]! * (red[1]! * blue[2]! - blue[1]! * red[2]!) + blue[0]! * (red[1]! * green[2]! - green[1]! * red[2]!)
  if (Math.abs(determinant) < 1e-8 || white.some(value => value <= 0)) {
    fail()
  }
  for (const name of ['rTRC', 'gTRC', 'bTRC']) {
    const tag = tags.get(name)
    if (!tag || tag.length < 12) {
      fail()
    }
    const type = tag!.toString('ascii', 0, 4)
    if (type === 'para') {
      assertParametricCurve(tag!)
    }
    else if (type === 'curv') {
      const samples = tag!.readUInt32BE(8)
      if (12 + samples * 2 > tag!.length || (samples === 1 && tag!.readUInt16BE(12) === 0)) {
        fail()
      }
      for (let index = 1; index < samples; index++) {
        if (tag!.readUInt16BE(12 + index * 2) < tag!.readUInt16BE(10 + index * 2)) {
          fail()
        }
      }
      if (samples > 1 && tag!.readUInt16BE(12) === tag!.readUInt16BE(10 + samples * 2)) {
        fail()
      }
    }
    else {
      fail()
    }
  }
}
