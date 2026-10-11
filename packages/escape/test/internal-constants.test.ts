import { describe, expect, it } from 'vitest'

import { ESCAPE_PREFIX, HYPHEN } from '../src/internal-constants'

describe('internal constants', () => {
  it('should expose canonical escape markers', () => {
    expect(ESCAPE_PREFIX).toBe('_')
    expect(HYPHEN).toBe('-')
  })
})
