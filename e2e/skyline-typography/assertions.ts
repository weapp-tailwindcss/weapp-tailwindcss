import type { TypographyPhase, TypographyRect } from './contract'
import { expect } from 'vitest'
import { headerIds, smallIds, weightIds } from './contract'

export function assertTypographyPhase(measured: Record<string, TypographyRect>, phase: TypographyPhase, renderer: string) {
  const rect = (id: string) => {
    const value = measured[id]
    expect(value, id).toBeDefined()
    return value!
  }
  // 直接消费主题变量的对照独立记录 Skyline 清空 inline theme 后的缓存行为。
  const header = phase.themeClear ? rect('probe-theme-variable').height : phase.header
  const small = phase.themeClear ? rect('probe-theme-small-variable').height : phase.small
  const weight = phase.themeClear ? rect('probe-theme-weight').width : rect('probe-weight-reference').width
  for (const id of headerIds) {
    expect(rect(id).height, `${phase.name}: ${id}`).toBeCloseTo(header, 1)
  }
  for (const id of smallIds) {
    expect(rect(id).height, `${phase.name}: ${id}`).toBeCloseTo(small, 1)
  }
  for (const id of weightIds) {
    expect(rect(id).width, `${phase.name}: ${id}`).toBeCloseTo(weight, 1)
  }
  expect(rect('probe-reference').height).toBeCloseTo(phase.header, 1)
  expect(rect('probe-author-empty').height).toBeCloseTo(rect('probe-normal').height, 1)
  if (phase.weight === 400) {
    expect(rect('probe-weight-reference').width).toBeCloseTo(rect('probe-weight-regular').width, 1)
  }
  else {
    expect(rect('probe-weight-reference').width).toBeGreaterThan(rect('probe-weight-regular').width)
  }
  if (phase.name !== 'default') {
    return
  }
  for (const fallback of ['literal', 'nested']) {
    for (const reset of ['missing', 'cycle']) {
      expect(rect(`probe-${reset}-${fallback}`).height).toBeCloseTo(64, 1)
    }
    expect(rect(`probe-valid-${fallback}`).height).toBeCloseTo(88, 1)
    expect(rect(`probe-empty-${fallback}`).height).toBeCloseTo(rect('probe-normal').height, 1)
  }
  if (renderer === 'webview') {
    expect(rect('probe-original').height).toBeCloseTo(64, 1)
    expect(rect('probe-weight-original').width).toBeCloseTo(rect('probe-weight-reference').width, 1)
  }
  else {
    expect(rect('probe-original').height).toBeCloseTo(rect('probe-normal').height, 1)
    expect(rect('probe-weight-original').width).toBeCloseTo(rect('probe-weight-regular').width, 1)
  }
}
