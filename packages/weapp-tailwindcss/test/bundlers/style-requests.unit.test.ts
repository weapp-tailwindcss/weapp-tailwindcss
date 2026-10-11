import { describe, expect, it } from 'vitest'
import { isSfcStyleSourceRequest } from '@/generation/style-requests'

describe('style requests', () => {
  it('distinguishes SFC source files from external Vue style requests', () => {
    expect(isSfcStyleSourceRequest('/project/src/pages/index.uvue')).toBe(true)
    expect(isSfcStyleSourceRequest('/project/src/pages/index.vue?vue&type=style&index=0')).toBe(true)
    expect(isSfcStyleSourceRequest('/project/src/pages/index.css?vue&type=style&index=0&src=true&lang.css')).toBe(false)
    expect(isSfcStyleSourceRequest('/project/src/pages/index.scss?vue&type=style&index=0&src=true&lang.scss')).toBe(false)
  })
})
