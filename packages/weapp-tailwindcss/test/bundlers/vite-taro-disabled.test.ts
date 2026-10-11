import { describe, expect, it } from 'vitest'
import { createTaroVitePlugins } from '@/bundlers/vite/frameworks/taro'

describe('Taro Vite disabled integration', () => {
  it('preserves the disabled plugin contract for native build configuration', () => {
    expect(createTaroVitePlugins({ disabled: true })).toBeUndefined()
  })
})
