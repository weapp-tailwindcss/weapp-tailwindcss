import { describe, expect, it } from 'vitest'
import { readViteHmrSource } from '@/bundlers/vite/shared/hmr-source'

describe('Vite HMR source reads', () => {
  it('accepts a synchronous source reader', async () => {
    expect(await readViteHmrSource({ read: () => 'p-4' })).toBe('p-4')
  })

  it('accepts an asynchronous source reader', async () => {
    expect(await readViteHmrSource({ read: async () => 'm-2' })).toBe('m-2')
  })

  it.each([false, true])('allows a scan fallback when a reader fails (async: %s)', async (asyncReader) => {
    const fail = () => { throw new Error('source was removed') }
    expect(await readViteHmrSource({ read: asyncReader ? async () => fail() : fail })).toBeUndefined()
  })
})
