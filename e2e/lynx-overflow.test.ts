import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, it } from 'vitest'
import { compatibilityCases } from '../examples/react-lynx/src/compatibility/catalog'
import { evidenceArtifactNames, lynxEvidenceStrategy, requiresPixelEffect } from '../examples/react-lynx/src/compatibility/evidence'
import { CaseCard } from '../examples/react-lynx/src/components/CaseCard'
import { fixtureHtml } from './lynx/fixture-html'
import { overflowGeometry, overflowImage } from './lynx/fixtures/overflow-images'
import { evaluateOverflow } from './lynx/overflow'
import { PNG } from './lynx/png'

it('overflow 的截图微小对齐差异不能直接形成支持结论，必须采集独立几何并离线核对裁剪区域', () => {
  const item = compatibilityCases.find(item => item.id === 'layout-overflow')!
  expect(requiresPixelEffect(item.id)).toBe(true)
  expect(lynxEvidenceStrategy(item)).toBe('overflow')
  expect(evidenceArtifactNames(item, { generated: true, bundled: true })).toEqual([
    'layout-overflow-geometry-probe.png',
    'layout-overflow-geometry-control.png',
    'layout-overflow-geometry.json',
  ])
})

it('真实组件仅control消费visible专属类，probe只消费候选且完全避开通用最小尺寸类', () => {
  const item = compatibilityCases.find(item => item.id === 'layout-overflow')!
  const html = fixtureHtml(CaseCard({ item }))
  const classes = (id: string) => html.match(new RegExp(`id="${id}" class="([^"]*)"`))![1]!.trim().split(/\s+/)
  expect(classes('probe-layout-overflow')).toEqual(['probe-overflow-panel', 'overflow-hidden'])
  expect(classes('control-layout-overflow')).toEqual(['probe-overflow-panel', 'probe-overflow-control'])
  expect(html).not.toContain('compat-probe')
})

it.each([1, 2, 3])('scale=%i：越界control完整可见且probe仅显示交集才通过', (scale) => {
  expect(evaluateOverflow(overflowGeometry(), overflowImage(true, scale), overflowImage(false, scale))).toMatchObject({ status: 'supported', checkpoints: [{ name: 'pixel:overflow-clip-v1', passed: true }] })
})

it('正确几何下完整显示的probe形成可执行的原生不支持证据', () => {
  expect(evaluateOverflow(overflowGeometry(), overflowImage(false), overflowImage(false))).toMatchObject({ status: 'unsupported', failureStage: 'runtime', checkpoints: [{ passed: false }] })
})

it('真实CI旧截图的微对齐差异不能冒充裁剪效果', async () => {
  const frames = await Promise.all(['probe', 'control'].map(async frame => PNG.sync.read(await fs.readFile(path.join(import.meta.dirname, 'lynx', 'fixtures', 'pixels', `layout-overflow-legacy-${frame}.png`)))))
  expect(frames[0]!.data.equals(frames[1]!.data)).toBe(false)
  expect(() => evaluateOverflow(overflowGeometry(), frames[0]!, frames[1]!)).toThrow(/overflow/)
})

it.each(['min-width', 'no-overflow', 'wrong-child-size', 'wrong-frame', 'control-clipped', 'partial-clip', 'missing-child', 'blank', 'transparent', 'partial-body', 'wrong-size'])('%s 必须阻断，不能归类为支持或平台不支持', (mode) => {
  const geometry = overflowGeometry()
  const probe = overflowImage(true)
  let control = overflowImage(false)
  if (mode === 'min-width') {
    geometry.probe.width = 120
    geometry.probe.right = geometry.probe.left + 120
  }
  if (mode === 'no-overflow') {
    geometry.probeChild.left -= 40
    geometry.probeChild.right -= 40
    geometry.probeChild.top -= 20
    geometry.probeChild.bottom -= 20
  }
  if (mode === 'wrong-child-size') {
    geometry.controlChild.width = 24
    geometry.controlChild.right = geometry.controlChild.left + 24
  }
  if (mode === 'wrong-frame') {
    geometry.controlContainer.width = 159
    geometry.controlContainer.right--
  }
  if (mode === 'control-clipped') {
    control = overflowImage(true)
  }
  if (mode === 'partial-clip') {
    probe.data.set([250, 204, 21, 255], (60 * 160 + 120) * 4)
  }
  if (mode === 'missing-child') {
    control.data.set([14, 165, 233, 255], (60 * 160 + 90) * 4)
  }
  if (mode === 'blank') {
    probe.data.fill(255)
  }
  if (mode === 'transparent') {
    probe.data[(30 * 160 + 30) * 4 + 3] = 0
  }
  if (mode === 'partial-body') {
    probe.data.set([247, 250, 251, 255], (30 * 160 + 30) * 4)
  }
  if (mode === 'wrong-size') {
    control = overflowImage(false, 2)
  }
  expect(() => evaluateOverflow(geometry, probe, control)).toThrow(/overflow/)
})
