import { expect, it } from 'vitest'
import { cases } from './catalog.mjs'
import { assertRenderedColors } from './color-contract.mjs'

const item = cases.find(item => item.id === 'web/nuxt-vite-tailwindcss-v4:web')
const correct = {
  color: { actual: [98, 116, 142, 255], expected: [98, 116, 142, 255], reference: '#62748e' },
  opacity: { actual: [236, 252, 245, 204], expected: [236, 252, 245, 204], reference: 'rgba(236,253,245,.8)' },
}

function missingChannels() {
  const samples = []
  samples.length = 4
  return samples
}

it('Nuxt 默认主题的文字与 80% 背景有独立参考且每轮判定', () => {
  expect(item.renderedColors).toBeDefined()
  for (const round of ['initial', 'replace', 'add', 'restore', 'refresh']) {
    expect(() => assertRenderedColors(item, correct, round)).not.toThrow()
  }
})

it.each([
  ['不透明背景', { ...correct, opacity: { ...correct.opacity, actual: [236, 253, 245, 255] } }],
  ['文字颜色错误', { ...correct, color: { ...correct.color, actual: [0, 0, 0, 255] } }],
  ['背景缺失', { color: correct.color }],
  ['透明度缺失', { ...correct, opacity: { ...correct.opacity, actual: [236, 252, 245] } }],
  ['参考值被替换', { ...correct, opacity: { ...correct.opacity, reference: 'transparent' } }],
  ['实际与参考都缺失', { ...correct, opacity: { reference: correct.opacity.reference } }],
  ['两份采样均为空位', { ...correct, opacity: { reference: correct.opacity.reference, actual: missingChannels(), expected: missingChannels() } }],
  ['整份证据缺失', undefined],
])('节点可见也拒绝%s', (_name, evidence) => {
  expect(() => assertRenderedColors(item, evidence, 'replace')).toThrow('rendered')
})
