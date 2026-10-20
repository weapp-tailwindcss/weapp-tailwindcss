import { expect, it } from 'vitest'
import { MEDIA_GATE_PROBE_IDS } from '../compatibility/media-gate-contract'
import { MediaGateProbes } from './MediaGateProbes'

it('媒体六帧是始终挂载的原生容器，每帧只有一个无文字和无伪状态的独立目标', () => {
  const tree = MediaGateProbes()
  expect(tree.props.flatten).toBe(false)
  const frames = tree.props.children
  expect(frames).toHaveLength(6)
  for (const [index, id] of MEDIA_GATE_PROBE_IDS.entries()) {
    const container = frames[index]!
    const target = container.props.children
    expect(container.props.id).toBe(`container-media-hover-v1-${id}`)
    expect(container.props.flatten).toBe(false)
    expect(target.type).toBe('view')
    expect(target.props).toEqual({ id: `media-hover-v1-${id}`, className: `media-hover-v1-target media-hover-v1-${id}`, flatten: false })
  }
})
