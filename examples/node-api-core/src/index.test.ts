import { describe, expect, it } from 'vitest'
import { runNodeApiCoreDemo } from './index'
import { runMemoryDemo } from './memory'

describe('node api core example', () => {
  it('transforms wxml, wxss and js through the package core export', async () => {
    const result = await runNodeApiCoreDemo()

    expect(result.wxml).toContain('mt-_b8px_B')
    expect(result.wxml).toContain('space-y-2_d5')
    expect(result.wxml).toContain('text-_b23_d43px_B')
    expect(result.revision).toBe(1)
    expect(result.snapshotClassSetSize).toBeGreaterThan(0)
    expect(result.wxss).toContain('.mt-_b8px_B')
    expect(result.wxss).toContain('.text-_b23_d43px_B')
    expect(result.wxss).toContain('.bg-_b_h123456_B')
    expect(result.js).toContain('mb-_b1_d5rem_B')
    expect(result.js).toContain('not-a-tailwind-token')
  }, 60000)

  it('keeps long-lived compiler candidate updates and removal bounded', async () => {
    const result = await runMemoryDemo({
      heapBudgetMb: 96,
      iterations: 80,
    })

    expect(result.samples.length).toBeGreaterThan(1)
    if (typeof globalThis.gc === 'function') {
      expect(result.deltaHeapUsedMb).toBeLessThanOrEqual(96)
    }
  }, 60000)
})
