import { expect, it } from 'vitest'
import { structuralImage } from './lynx/fixtures/structural-images'
import { evaluateStructural } from './lynx/structural'

it.each([1, 2.625, 3])('核对 %s 倍画布中首项、偶数项及第三项的预期效果', (scale) => {
  expect(evaluateStructural([structuralImage(scale), structuralImage(scale, 'plain'), structuralImage(scale)]).status).toBe('supported')
})

it.each(['plain', 'missing-first', 'missing-odd', 'unconditional', 'red', 'shifted', 'empty'] as const)('%s 不能由图片任意差异冒充结构选择器支持', (kind) => {
  expect(evaluateStructural([structuralImage(1, kind), structuralImage(1, 'plain'), structuralImage()]).status).toBe('unsupported')
})

it.each(['plain', 'missing-first', 'missing-odd', 'empty'] as const)('显式效果为 %s 时夹具失效，不归为 SDK 不支持', (kind) => {
  expect(() => evaluateStructural([structuralImage(), structuralImage(1, 'plain'), structuralImage(1, kind)])).toThrow('对照')
})

it('拒绝缺图、不等尺寸、透明画布及缺失普通文字', () => {
  expect(() => evaluateStructural([structuralImage(), structuralImage()])).toThrow('三张')
  expect(() => evaluateStructural([structuralImage(), structuralImage(2), structuralImage()])).toThrow('等尺寸')
  expect(() => evaluateStructural([structuralImage(), structuralImage(1, 'empty'), structuralImage()])).toThrow('对照')
  const image = structuralImage()
  image.data[3] = 0
  expect(() => evaluateStructural([image, structuralImage(1, 'plain'), structuralImage()])).toThrow('不透明')
})

it('probe 与显式首项同步错位也不能自证为有效粗体', () => {
  const reference = structuralImage()
  const shifted = structuralImage(1, 'shifted')
  reference.data.set(shifted.data.subarray(20 * 160 * 4, 60 * 160 * 4), 20 * 160 * 4)
  expect(() => evaluateStructural([reference, structuralImage(1, 'plain'), reference])).toThrow('对照')
})
