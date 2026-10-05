import { describe, expect, it } from 'vitest'
import { compatibilityCases } from '../compatibility/catalog'
import { CaseCard } from './CaseCard'

interface ElementNode {
  type: string | ((props: Record<string, unknown>) => unknown)
  props: Record<string, unknown>
}

function elements(tree: unknown): ElementNode[] {
  if (Array.isArray(tree)) {
    return tree.flatMap(elements)
  }
  if (!tree || typeof tree !== 'object' || !('type' in tree) || !('props' in tree)) {
    return []
  }
  const node = tree as ElementNode
  if (typeof node.type === 'function') {
    return elements(node.type(node.props))
  }
  return [node, ...elements(node.props.children)]
}

function probeNodes(id: string) {
  const item = compatibilityCases.find(item => item.id === id)!
  const nodes = elements(CaseCard({ item }))
  const probe = nodes.find(node => node.props.id === `probe-${id}`)!
  const control = nodes.find(node => node.props.id === `control-${id}`)!
  const text = (node: ElementNode) => elements(node).find(child => child.type === 'text')!
  return { item, probe, control, text }
}

describe('Lynx compatibility text fixtures', () => {
  it('dark 媒体 utility 由同步绘制的 text 直接消费，控制组不预设白字', () => {
    const { item, probe, control, text } = probeNodes('variant-dark')
    expect(String(text(probe).props.className)).toContain(item.className)
    expect(String(text(control).props.className)).not.toContain(item.className)
    expect(String(text(probe).props.className).split(/\s+/)).not.toContain('probe-target')
    expect(String(text(control).props.className).split(/\s+/)).not.toContain('probe-target')
    expect(text(probe).props['async-display']).toBe(false)
    expect(text(control).props['async-display']).toBe(false)
    expect(text(probe).props.children).toBe(text(control).props.children)
    expect(elements(CaseCard({ item })).some(node => String(node.props.className).split(/\s+/).includes('dark'))).toBe(false)
  })

  it.each(['grid-placement', 'grid-auto', 'grid-justify-self'])('%s 使用专属 grid 角色且没有额外文字子项', (id) => {
    const { item, probe, control } = probeNodes(id)
    const nodes = elements(CaseCard({ item }))
    for (const prefix of ['probe', 'control']) {
      const container = nodes.find(node => node.props.id === `${prefix}-container-${id}`)!
      expect(container.props.className).toContain(`grid-slot-${id}`)
    }
    expect(String(probe.props.className)).toContain(item.className)
    expect(String(control.props.className)).not.toContain(item.className)
    expect(elements(probe).filter(node => node.type === 'text')).toEqual([])
    expect(elements(control).filter(node => node.type === 'text')).toEqual([])
    if (id === 'grid-auto') {
      expect(elements(probe).filter(node => String(node.props.id).startsWith('probe-child')).map(node => node.props.id)).toEqual([`probe-child-${id}-b`, `probe-child-${id}-a`])
    }
    if (id === 'grid-placement') {
      expect(nodes.filter(node => node.props.className === 'grid-placement-blocker')).toHaveLength(2)
    }
  })

  it.each([
    ['layout-box-sizing', 'probe-box-sizing'],
    ['sizing-min-max', 'probe-constrained-size'],
    ['syntax-css-variable', 'probe-constrained-size'],
  ])('%s 为两组应用相同的显式尺寸夹具', (id, fixture) => {
    const { item, probe, control } = probeNodes(id)
    expect(String(probe.props.className).split(/\s+/)).toContain(fixture)
    expect(String(control.props.className).split(/\s+/)).toContain(fixture)
    expect(String(probe.props.className)).toContain(item.className)
    expect(String(control.props.className)).not.toContain(item.className)
  })

  it.each([
    ['background-size', 'probe-background-size'],
    ['background-linear-gradient', 'probe-linear-gradient'],
    ['effect-shadow', 'probe-shadow'],
    ['transform-skew', 'probe-skew'],
  ])('%s 使用相同的单类默认样式，让 utility 参与渲染', (id, fixture) => {
    const { item, probe, control } = probeNodes(id)
    expect(String(probe.props.className).split(/\s+/)).toContain(fixture)
    expect(String(control.props.className).split(/\s+/)).toContain(fixture)
    expect(String(probe.props.className)).toContain(item.className)
    expect(String(control.props.className)).not.toContain(item.className)
  })

  it.each(['type-size', 'type-tracking', 'type-weight-style', 'type-decoration', 'syntax-opacity-modifier', 'syntax-type-hint'])('%s 将文字样式交给真实 text 消费，control 保持无被测类', (id) => {
    const { item, probe, control, text } = probeNodes(id)
    for (const candidate of item.className.split(/\s+/)) {
      expect(String(text(probe).props.className).split(/\s+/)).toContain(candidate)
      expect(String(probe.props.className).split(/\s+/)).not.toContain(candidate)
      expect(String(text(control).props.className).split(/\s+/)).not.toContain(candidate)
    }
    expect(text(probe).props.children).toBe(text(control).props.children)
  })

  it('任意后代选择器具有真实文字 target，控制组的内容和结构相同', () => {
    const { item, probe, control, text } = probeNodes('variant-arbitrary')
    expect(String(probe.props.className)).toContain(item.className)
    expect(String(text(probe).props.className).split(/\s+/)).toContain('target')
    expect(text(probe).props).toEqual(text(control).props)
  })

  it('skew 固定画布只含实心主体，避免文字和装饰物干扰轮廓', () => {
    const { item, probe, control } = probeNodes('transform-skew')
    expect(elements(probe)).toHaveLength(1)
    expect(elements(control)).toHaveLength(1)
    for (const node of elements(CaseCard({ item })).filter(node => String(node.props.id).includes('-container-'))) {
      expect(node.props.flatten).toBe(false)
      expect(node.props.className).toContain('probe-capture')
    }
  })

  it('透明度、边框与交互样式仍由原 view 消费并保留固定捕获画布', () => {
    for (const id of ['effect-opacity', 'border-width-color', 'variant-state']) {
      const { item, probe, text } = probeNodes(id)
      expect(String(probe.props.className)).toContain(item.className)
      expect(String(text(probe).props.className)).not.toContain(item.className)
      const nodes = elements(CaseCard({ item }))
      for (const prefix of ['probe', 'control']) {
        const capture = nodes.find(node => node.props.id === `${prefix}-container-${id}`)!
        expect(capture.props.flatten).toBe(false)
        expect(String(capture.props.className).split(/\s+/)).toContain('probe-capture')
      }
    }
  })
})
