import { describe, expect, it } from 'vitest'
import { typedText, typingCursor } from './Typing'

describe('typing animation helpers', () => {
  it('reveals a deterministic prefix without exceeding the source text', () => {
    expect(typedText('plugin()', 0, 10, 20)).toBe('')
    expect(typedText('plugin()', 20, 10, 20)).toBe('plug')
    expect(typedText('plugin()', 40, 10, 20)).toBe('plugin()')
    expect(typedText('plugin()', 400, 10, 20)).toBe('plugin()')
  })

  it('blinks the cursor on a fixed eight-frame cadence', () => {
    expect(typingCursor(0)).toBe(true)
    expect(typingCursor(7)).toBe(true)
    expect(typingCursor(8)).toBe(false)
    expect(typingCursor(16)).toBe(true)
  })
})
