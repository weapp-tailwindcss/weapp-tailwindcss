import { describe, expect, it } from 'vitest'
import { isUniAppXEnabled, resolveUniAppXOptions } from '@/uni-app-x/options'

describe('uni-app-x options', () => {
  it.each([
    [undefined, false],
    [false, false],
    [true, true],
  ] as const)('resolves top-level enabled state from %s', (option, enabled) => {
    expect(resolveUniAppXOptions(option).enabled).toBe(enabled)
    expect(isUniAppXEnabled(option)).toBe(enabled)
  })

  it('keeps component local styles disabled for boolean shortcuts', () => {
    expect(resolveUniAppXOptions(true).componentLocalStyles).toEqual({
      enabled: false,
      onlyWhenStyleIsolationVersion2: true,
    })
    expect(resolveUniAppXOptions(false).componentLocalStyles).toEqual({
      enabled: false,
      onlyWhenStyleIsolationVersion2: true,
    })
  })

  it('enables component local styles for object options by default', () => {
    expect(resolveUniAppXOptions({ enabled: true }).componentLocalStyles).toEqual({
      enabled: true,
      onlyWhenStyleIsolationVersion2: true,
    })
  })

  it('resolves component local style overrides', () => {
    expect(resolveUniAppXOptions({
      componentLocalStyles: false,
    }).componentLocalStyles).toEqual({
      enabled: false,
      onlyWhenStyleIsolationVersion2: true,
    })

    expect(resolveUniAppXOptions({
      componentLocalStyles: {
        onlyWhenStyleIsolationVersion2: false,
      },
    }).componentLocalStyles).toEqual({
      enabled: true,
      onlyWhenStyleIsolationVersion2: false,
    })
  })

  it('preserves custom local style matchers', () => {
    const componentMatcher = (id: string) => id.includes('/layouts/')
    const pageMatcher = (id: string) => id.includes('/screens/')

    expect(resolveUniAppXOptions({
      componentLocalStyles: {
        componentMatcher,
        pageMatcher,
      },
    }).componentLocalStyles).toEqual({
      componentMatcher,
      enabled: true,
      onlyWhenStyleIsolationVersion2: true,
      pageMatcher,
    })
  })

  it('keeps unsupported utility mode defaulted to warn', () => {
    expect(resolveUniAppXOptions({ enabled: true }).uvueUnsupported).toBe('warn')
    expect(resolveUniAppXOptions({ enabled: true, uvueUnsupported: 'silent' }).uvueUnsupported).toBe('silent')
  })
})
