import { describe, expect, it, vi } from 'vitest'
import { waitForProbeLayout } from './runtime-ready'

describe('waitForProbeLayout', () => {
  it('waits until both probe nodes have a non-zero layout', async () => {
    let time = 0
    let attempts = 0
    const measure = vi.fn(async () => {
      attempts++
      return attempts > 4 ? { width: 72, height: 16 } : undefined
    })

    await expect(waitForProbeLayout(measure, {
      intervalMs: 10,
      now: () => time,
      sleep: async (duration) => {
        time += duration
      },
      timeoutMs: 100,
    })).resolves.toBe(true)
    expect(measure).toHaveBeenCalledTimes(6)
  })

  it('returns false when the initial layout never becomes measurable', async () => {
    let time = 0
    const measure = vi.fn(async () => undefined)

    await expect(waitForProbeLayout(measure, {
      intervalMs: 10,
      now: () => time,
      sleep: async (duration) => {
        time += duration
      },
      timeoutMs: 25,
    })).resolves.toBe(false)
    expect(measure).toHaveBeenCalledTimes(8)
  })
})
