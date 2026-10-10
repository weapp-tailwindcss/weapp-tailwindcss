import { expect, it } from 'vitest'
import { evaluateColorScheme, validateColorSchemeReceipts } from './lynx/color-scheme'
import { darkImage, darkReceipts } from './lynx/fixtures/dark-images'

it.each([1, 2.625, 3])('只接受 %s 倍像素的真实字形变白', (scale) => {
  expect(evaluateColorScheme([darkImage(scale), darkImage(scale), darkImage(scale, 'white'), darkImage(scale)]).status).toBe('supported')
})

it.each(['ink', 'missing', 'red', 'shifted', 'background'] as const)('%s 不能冒充 dark 文字支持', (kind) => {
  expect(evaluateColorScheme([darkImage(), darkImage(), darkImage(1, kind), darkImage()]).status).toBe('unsupported')
})

it.each([0, 1, 3])('第 %s 帧白字导致夹具失效，不能据此归为不支持', (index) => {
  const images = [darkImage(), darkImage(), darkImage(1, 'white'), darkImage()]
  images[index] = darkImage(1, 'white')
  expect(() => evaluateColorScheme(images)).toThrow('夹具')
})

it.each([0, 1, 3])('第 %s 帧的 LCD 色边仍被拒绝，不能放宽颜色容差掩盖采集故障', (index) => {
  const images = [darkImage(), darkImage(), darkImage(1, 'white'), darkImage()]
  // Ubuntu Chromium 153 实际浅色失败帧：蓝底文字的三个通道使用了不同覆盖率。
  images[index]!.data.set([15, 69, 50, 255], (70 * images[index]!.width + 52) * 4)
  expect(() => evaluateColorScheme(images)).toThrow('颜色模式浅色或 control 文字夹具无效')
})

it('拒绝缺帧、缺字形、透明及非等尺寸截图', () => {
  expect(() => evaluateColorScheme([darkImage(), darkImage()])).toThrow('四张')
  expect(() => evaluateColorScheme([darkImage(), darkImage(2), darkImage(), darkImage()])).toThrow('等尺寸')
  expect(() => evaluateColorScheme([darkImage(1, 'missing'), darkImage(), darkImage(), darkImage()])).toThrow('文字')
  const transparent = darkImage()
  transparent.data[3] = 0
  expect(() => evaluateColorScheme([darkImage(), darkImage(), transparent, darkImage()])).toThrow('不透明')
})

it('必须带同一 run 的两个切换和一个恢复回执，不能复用请求', () => {
  const result = evaluateColorScheme([darkImage(), darkImage(), darkImage(1, 'white'), darkImage()])
  result.colorScheme = darkReceipts('run')
  expect(() => validateColorSchemeReceipts(result, 'run')).not.toThrow()
  expect(() => validateColorSchemeReceipts(result, 'other')).toThrow('身份')
  result.colorScheme!.restored = { ...result.colorScheme!.dark }
  expect(() => validateColorSchemeReceipts(result, 'run')).toThrow('身份')
  delete result.colorScheme
  expect(() => validateColorSchemeReceipts(result, 'run')).toThrow('回执')
})
