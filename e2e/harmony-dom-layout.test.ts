import type { HarmonyDomProbe } from './hbuilderx-local/harmony-dom-probe'
import { describe, expect, it } from 'vitest'
import { analyzeHarmonyDomTextPairs } from '../scripts/demo-visual-e2e-report/harmony-layout'

function probe(): HarmonyDomProbe {
  const node = (text: string) => ({ id: '', tagName: 'TEXT', text, rect: { left: 12, top: 100, width: 220, height: 52 } })
  return { runId: 'current', pixelRatio: 3.5, marker: node('marker'), nodes: [node('Tailwind line 1\nline 2'), node('Native line 1 line 2')] }
}
const pairs = [{ tailwindText: 'Tailwind line 1 line 2', nativeText: 'Native line 1 line 2' }]

describe('Harmony 真实 DOM 布局证据', () => {
  it('将逻辑像素换算为设备像素并保留实际文本', () => {
    const [result] = analyzeHarmonyDomTextPairs(probe(), pairs)
    expect(result).toMatchObject({ heightDifference: 0, tailwind: { text: pairs[0]!.tailwindText, bounds: { minX: 42, height: 182, width: 770 } }, native: { bounds: { height: 182 } } })
  })

  it('以设备像素执行误差门槛', () => {
    const value = probe()
    value.nodes[1]!.rect.height += 0.5
    expect(() => analyzeHarmonyDomTextPairs(value, pairs)).toThrow('高度不一致')
    expect(analyzeHarmonyDomTextPairs(value, [{ ...pairs[0]!, maxHeightDifference: 2 }])[0]?.heightDifference).toBe(1.75)
  })

  it('不把数字节点下标作为缺失文本的替代证据', () => {
    const value = probe()
    value.nodes[0]!.text = ''
    expect(() => analyzeHarmonyDomTextPairs(value, [{ ...pairs[0]!, tailwindLayoutNodeIndex: 0 }])).toThrow('缺少唯一且已布局')
  })

  it('拒绝重复文本与零尺寸节点', () => {
    const duplicated = probe()
    duplicated.nodes.push(duplicated.nodes[0]!)
    expect(() => analyzeHarmonyDomTextPairs(duplicated, pairs)).toThrow('缺少唯一且已布局')
    const empty = probe()
    empty.nodes[1]!.rect.height = 0
    expect(() => analyzeHarmonyDomTextPairs(empty, pairs)).toThrow('缺少唯一且已布局')
  })
})
