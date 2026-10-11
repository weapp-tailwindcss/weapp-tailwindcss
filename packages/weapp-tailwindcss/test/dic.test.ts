import { MappingChars2StringEntries } from '@weapp-tailwindcss/escape'

function check(e: [string, string][], allowUnderline = false) {
  const set = new Set()
  let valid = true
  for (const [, value] of e) {
    if (allowUnderline && value === '_') {
      continue
    }
    if (set.has(value)) {
      valid = false
      console.log(`duplicate value: '${value}' `)
      break
    }
    else {
      set.add(value)
    }
  }
  return valid
}

describe('dic test', () => {
  it('check duplicate', () => {
    expect(check(MappingChars2StringEntries)).toBe(true)
  })
})
