import { expect, it } from 'vitest'
import { textFlowImage } from './lynx/fixtures/text-flow-images'
import { evaluateTextFlow } from './lynx/text-flow'

it.each([1, 2.625, 3])('文字流在 %s 倍密度同时满足独立对齐与空白对照', (scale) => {
  expect(evaluateTextFlow([textFlowImage(scale), textFlowImage(scale, 'control'), textFlowImage(scale)]).status).toBe('supported')
})

it.each(['top', 'collapsed', 'nowrap', 'shifted', 'empty'] as const)('拒绝 %s 冒充文字流支持', (kind) => {
  expect(evaluateTextFlow([textFlowImage(1, kind), textFlowImage(1, 'control'), textFlowImage()]).status).toBe('unsupported')
})

it.each(['collapsed', 'nowrap', 'empty'] as const)('拒绝 %s 手工分行对照', (kind) => {
  expect(() => evaluateTextFlow([textFlowImage(), textFlowImage(1, 'control'), textFlowImage(1, kind)])).toThrow('对照')
})

it('缺图、坏画布和空白控制图不能形成原生结论', () => {
  expect(() => evaluateTextFlow([textFlowImage()])).toThrow('三张')
  expect(() => evaluateTextFlow([textFlowImage(), textFlowImage(2), textFlowImage()])).toThrow('等尺寸')
  expect(() => evaluateTextFlow([textFlowImage(), textFlowImage(1, 'empty'), textFlowImage()])).toThrow('对照')
  const image = textFlowImage()
  image.data[3] = 0
  expect(() => evaluateTextFlow([image, textFlowImage(1, 'control'), textFlowImage()])).toThrow('不透明')
})

it.each(['shifted', 'shifted-down'] as const)('probe/reference 同步移动文字 %s 不能互相自证有效', (kind) => {
  const shifted = textFlowImage(1, kind)
  expect(() => evaluateTextFlow([shifted, textFlowImage(1, 'control'), shifted])).toThrow('对照')
})

it('probe/reference 同步使用不均匀单空格不能自证软换行边界', () => {
  const uneven = textFlowImage(1, 'uneven')
  expect(() => evaluateTextFlow([uneven, textFlowImage(1, 'control'), uneven])).toThrow('对照')
})
