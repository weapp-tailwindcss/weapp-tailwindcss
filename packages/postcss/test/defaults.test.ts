import { getDefaultOptions } from '@/defaults'

describe('getDefaultOptions', () => {
  it('provides the expected defaults when no overrides are given', () => {
    const defaults = getDefaultOptions()

    expect(defaults.cssPresetEnv?.features?.['cascade-layers']).toBeUndefined()
    expect(defaults.cssPresetEnv?.features?.['is-pseudo-class']).toEqual({ specificityMatchingName: 'weapp-tw-ig' })
    expect(defaults.cssPresetEnv?.features?.['custom-properties']).toBe(false)
    expect(defaults.cssPresetEnv?.features?.['color-mix']).toBe(true)
    expect(defaults.cssPresetEnv?.features?.['oklab-function']).toBe(true)
    expect(defaults.cssPresetEnv?.features?.['color-functional-notation']).toEqual({ preserve: false })
    expect(defaults.cssPresetEnv?.autoprefixer?.add).toBe(false)
    expect(defaults.cssSelectorReplacement).toEqual({
      root: ['page', '.tw-root', 'wx-root-portal-content'],
      universal: ['view', 'text'],
    })
    expect(defaults.cssRemoveProperty).toBe(true)
  })

  it('keeps custom-properties opt-in when cssCalc is truthy', () => {
    const defaults = getDefaultOptions({ cssCalc: true })

    expect(defaults.cssPresetEnv?.features?.['custom-properties']).toBe(false)
  })

  it('respects falsy custom-properties overrides', () => {
    const defaults = getDefaultOptions({
      cssPresetEnv: {
        features: {
          'custom-properties': false,
        },
      },
    })

    expect(defaults.cssPresetEnv?.features?.['custom-properties']).toBe(false)
  })

  it('respects color-functional-notation overrides', () => {
    const defaults = getDefaultOptions({
      cssPresetEnv: {
        features: {
          'color-functional-notation': true,
        },
      },
    })

    expect(defaults.cssPresetEnv?.features?.['color-functional-notation']).toBe(true)
  })
})
