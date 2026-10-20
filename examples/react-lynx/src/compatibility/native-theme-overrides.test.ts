import type { NativeEvidenceWriter } from './native-evidence'
import type { ThemeOverridePhase } from './theme-overrides-contract'
import { afterEach, expect, it, vi } from 'vitest'
import { bindThemeOverrideController, collectThemeOverrides } from './native-theme-overrides'

let unbind: (() => void) | undefined
afterEach(() => {
  unbind?.()
  unbind = undefined
  vi.useRealTimers()
})

it('每个新状态先确认实际宿主标尺，再采完整九帧', async () => {
  let phase: ThemeOverridePhase = 'before'
  unbind = bindThemeOverrideController((value) => {
    phase = value
  })
  const captured: string[] = []
  const writer = { geometry: async (id: string) => {
    captured.push(id)
    return {}
  } } as unknown as NativeEvidenceWriter
  const measure = vi.fn(async (id: string) => {
    expect(id).toContain(`-${phase}-a`)
    return { width: { before: 16, after: 24, restored: 32 }[phase], height: 8 } as never
  })
  const result = await collectThemeOverrides(writer, measure)
  expect(result.frames).toHaveLength(9)
  expect(new Set(captured).size).toBe(9)
  expect(phase).toBe('restored')
  expect(measure).toHaveBeenCalledTimes(9)
})

it('宿主采集失败后恢复状态并拒绝成功报告', async () => {
  let phase: ThemeOverridePhase = 'before'
  const phases: string[] = []
  unbind = bindThemeOverrideController((value) => {
    phase = value
    phases.push(value)
  })
  const geometry = vi.fn(async () => {
    throw new Error('capture failed')
  })
  await expect(collectThemeOverrides({ geometry } as unknown as NativeEvidenceWriter, async () => ({ width: phase === 'restored' ? 32 : 16, height: 8 }) as never)).rejects.toThrow('采集或恢复失败')
  expect(phases).toEqual(['before', 'restored'])
  expect(geometry).toHaveBeenCalledTimes(1)
})

it('只有旧尺寸的 after 不得开始采集，超时后仍恢复', async () => {
  vi.useFakeTimers()
  let phase: ThemeOverridePhase = 'before'
  unbind = bindThemeOverrideController((value) => {
    phase = value
  })
  const geometry = vi.fn(async () => ({}))
  const pending = collectThemeOverrides({ geometry } as unknown as NativeEvidenceWriter, async () => ({ width: phase === 'restored' ? 32 : 16, height: 8 }) as never)
  const rejected = expect(pending).rejects.toThrow('采集或恢复失败')
  await vi.advanceTimersByTimeAsync(5100)
  await rejected
  expect(geometry).toHaveBeenCalledTimes(3)
  expect(phase).toBe('restored')
})
