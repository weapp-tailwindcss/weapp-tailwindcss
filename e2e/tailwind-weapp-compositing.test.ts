import { Buffer } from 'node:buffer'
import { deflateSync } from 'node:zlib'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'
import { assertionPassed } from './tailwind-capabilities/report'
import { assertWeappRgbProfile } from './tailwind-capabilities/weapp/color-profile'
import { assertWeappCompositeEncoding, weappCompositeAssertions } from './tailwind-capabilities/weapp/compositing'

const expected = { foreground: [255, 0, 0, 255] as const, background: [255, 255, 255, 255] as const, actualAlpha: 0.5, referenceAlpha: 0.5, equal: true }
const samples = {
  foreground: [234, 51, 35, 255],
  background: [255, 255, 255, 255],
  actual: [244, 153, 145, 255],
  reference: [244, 153, 145, 255],
  normalizedForeground: [255, 0, 0, 255],
  normalizedBackground: [255, 255, 255, 255],
  normalizedGray: [128, 128, 128, 255],
}

describe('微信显示色彩空间中的独立 alpha 合成 oracle', () => {
  it('先转换显示空间再合成的原始像素按预声明 alpha 验证，不假定转换可交换', () => {
    expect(weappCompositeAssertions('default', samples, expected).every(assertionPassed)).toBe(true)
  })

  it('双方同错为四分之一权重时不能只凭参考相同通过', () => {
    expect(weappCompositeAssertions('default', { ...samples, actual: [250, 204, 200, 255], reference: [250, 204, 200, 255] }, expected).every(assertionPassed)).toBe(false)
  })

  it('校准前景或背景必须在归一化后命中绝对 sRGB，不能跟随错误主体取样', () => {
    for (const field of ['normalizedForeground', 'normalizedBackground', 'normalizedGray'] as const) {
      expect(weappCompositeAssertions('default', { ...samples, [field]: [0, 0, 0, 255] }, expected).every(assertionPassed)).toBe(false)
    }
  })

  it('动态限制分别检查主体不透明与参考透明，参考错误同样失败', () => {
    const negative = { ...expected, actualAlpha: 1, equal: false }
    expect(weappCompositeAssertions('after', { ...samples, actual: samples.foreground }, negative).every(assertionPassed)).toBe(true)
    expect(weappCompositeAssertions('after', { ...samples, actual: samples.foreground, reference: samples.foreground }, negative).every(assertionPassed)).toBe(false)
  })

  it('alpha、样本通道、半透明校准和不完整原始采样全部拒绝', () => {
    for (const actualAlpha of [-0.1, 1.1, Number.NaN]) {
      expect(() => weappCompositeAssertions('default', samples, { ...expected, actualAlpha })).toThrow()
    }
    expect(() => weappCompositeAssertions('default', { ...samples, foreground: [] }, expected)).toThrow()
    expect(() => weappCompositeAssertions('default', { ...samples, foreground: [234, 51, 35, 128] }, expected)).toThrow()
  })

  it('只接受八位 RGB 与可解释 ICC，HDR、非 RGB 和损坏的配置直接拒绝', () => {
    const image = PNG.sync.write(new PNG({ width: 1, height: 1 }))
    expect(() => assertWeappCompositeEncoding(image)).not.toThrow()
    const grayscale = Buffer.from(image)
    grayscale[25] = 0
    expect(() => assertWeappCompositeEncoding(grayscale)).toThrow('八位 RGB')
    const chunk = (name: string, data: Buffer) => {
      const bytes = Buffer.alloc(data.length + 12)
      bytes.writeUInt32BE(data.length)
      bytes.write(name, 4, 4, 'ascii')
      data.copy(bytes, 8)
      return Buffer.concat([image.subarray(0, 33), bytes, image.subarray(33)])
    }
    expect(() => assertWeappCompositeEncoding(chunk('cICP', Buffer.from([9, 16, 0, 1])))).toThrow('HDR')
    for (const data of [Buffer.alloc(0), Buffer.from([255])]) {
      expect(() => assertWeappCompositeEncoding(chunk('sRGB', data))).toThrow('sRGB')
    }
    const profile = Buffer.alloc(128)
    profile.writeUInt32BE(128)
    profile.write('GRAY', 16)
    profile.write('acsp', 36)
    expect(() => assertWeappCompositeEncoding(chunk('iCCP', Buffer.concat([Buffer.from('test\0\0'), deflateSync(profile)])))).toThrow('RGB ICC')
    expect(() => assertWeappCompositeEncoding(chunk('iCCP', Buffer.from('invalid')))).toThrow('ICC 编码')
  })
})

// 实际 Skia 矩阵/TRC 配置只用于协议验证，不代表当前运行时证据。
const skiaProfile = Buffer.from('AAACGAAAAAAEMAAAbW50clJHQiBYWVogB+AAAQABAAAAAAAAYWNzcAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAEAAPbWAAEAAAAA0y0AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJZGVzYwAAAPAAAAB0clhZWgAAAWQAAAAUZ1hZWgAAAXgAAAAUYlhZWgAAAYwAAAAUd3RwdAAAAaAAAAAUclRSQwAAAbQAAAAoZ1RSQwAAAbQAAAAoYlRSQwAAAbQAAAAoY3BydAAAAdwAAAA8bWx1YwAAAAAAAAABAAAADGVuVVMAAABYAAAAHABHAG8AbwBnAGwAZQAvAFMAawBpAGEALwAwAEUAOQA4ADMARQBBAEEANQBBADEAMgA4ADkANgA1ADAAQwBCADcAQwA3AEYANgA4ADIAMQBEAEYANgA5ADZYWVogAAAAAAAAg94AAD2+////u1hZWiAAAAAAAABKvgAAsTYAAAq5WFlaIAAAAAAAACg7AAARDAAAyM1YWVogAAAAAAAA9tYAAQAAAADTLXBhcmEAAAAAAAQAAAACZUIAAPMVAAAMqgAAE+UAAAuDAAAAFwAAAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAACAAAAAcAEcAbwBvAGcAbABlACAASQBuAGMALgAgADIAMAAxADY=', 'base64')

it('真实矩阵/TRC profile可读取；伪RGB头、越界tag、HDR和未知LUT均拒绝', () => {
  expect(() => assertWeappRgbProfile(skiaProfile)).not.toThrow()
  const fake = Buffer.from(skiaProfile.subarray(0, 128))
  fake.writeUInt32BE(128)
  expect(() => assertWeappRgbProfile(fake)).toThrow()
  for (const mode of ['offset', 'size', 'hdr', 'lut'] as const) {
    const changed = Buffer.from(skiaProfile)
    if (mode === 'offset') {
      changed.writeUInt32BE(skiaProfile.length + 4, 136)
    }
    if (mode === 'size') {
      changed.writeUInt32BE(skiaProfile.length, 140)
    }
    if (mode === 'hdr') {
      changed.write('cicp', 132)
    }
    if (mode === 'lut') {
      changed.write('A2B0', 132)
    }
    expect(() => assertWeappRgbProfile(changed)).toThrow()
  }
})

it('重复 ICC 与 ICC/sRGB 冲突不能依赖解码器自行择一', () => {
  const image = PNG.sync.write(new PNG({ width: 1, height: 1 }))
  const chunk = (name: string, data: Buffer) => {
    const bytes = Buffer.alloc(data.length + 12)
    bytes.writeUInt32BE(data.length)
    bytes.write(name, 4, 4, 'ascii')
    data.copy(bytes, 8)
    return bytes
  }
  const icc = chunk('iCCP', Buffer.concat([Buffer.from('test\0\0'), deflateSync(skiaProfile)]))
  for (const second of [icc, chunk('sRGB', Buffer.from([0]))]) {
    const conflicting = Buffer.concat([image.subarray(0, 33), icc, second, image.subarray(33)])
    expect(() => assertWeappCompositeEncoding(conflicting)).toThrow('重复或冲突')
  }
})

it('无定义、下降和常量 TRC 以及未登记转换标签必须拒绝', () => {
  const trc = skiaProfile.readUInt32BE(132 + 5 * 12 + 4)
  for (const [parameter, value] of [[1, 0], [2, -1], [3, -1]] as const) {
    const changed = Buffer.from(skiaProfile)
    changed.writeInt32BE(value * 65536, trc + 12 + parameter * 4)
    expect(() => assertWeappRgbProfile(changed)).toThrow()
  }
  for (const tag of ['D2B0', 'B2D0', 'A2B3', 'gamt']) {
    const changed = Buffer.from(skiaProfile)
    changed.write(tag, 132)
    expect(() => assertWeappRgbProfile(changed)).toThrow()
  }
})
