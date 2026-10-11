import { afterEach, describe, expect, it, vi } from 'vitest'

describe('variant helpers', () => {
  afterEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doUnmock('@weapp-tailwindcss/variants')
    vi.doUnmock('@weapp-tailwindcss/merge')
  })

  it('does not merge when variant returns undefined', async () => {
    const mergeSpy = vi.fn()

    vi.doMock('@weapp-tailwindcss/variants', () => ({
      __esModule: true,
      tv: () => () => undefined,
    }))
    vi.doMock('@weapp-tailwindcss/merge', () => ({
      __esModule: true,
      twMerge: mergeSpy,
    }))

    const { button } = await import('../src/variants')

    expect(button()).toBeUndefined()
    expect(mergeSpy).not.toHaveBeenCalled()
  })
})
