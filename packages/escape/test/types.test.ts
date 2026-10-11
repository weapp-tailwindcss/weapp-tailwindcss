import { describe, expect, it } from 'vitest'

import { toEscapeOptions, toUnescapeOptions } from '../src/types'

describe('types helpers', () => {
  it('toEscapeOptions should normalize undefined input', () => {
    expect(toEscapeOptions()).toEqual({})

    const options = { ignoreHead: true, map: { '#': '_hash' } }
    expect(toEscapeOptions(options)).toBe(options)
  })

  it('toUnescapeOptions should normalize undefined input', () => {
    expect(toUnescapeOptions()).toEqual({})

    const options = { ignoreHead: false, map: { '#': '_hash' } }
    expect(toUnescapeOptions(options)).toBe(options)
  })
})
