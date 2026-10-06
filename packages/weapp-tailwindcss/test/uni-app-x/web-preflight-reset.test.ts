import { describe, expect, it } from 'vitest'
import { UNI_APP_X_WEB_PREFLIGHT_RESET_CSS, UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER, withUniAppXWebPreflightReset } from '@/uni-app-x/web-preflight-reset'

describe('uni-app x Web preflight reset', () => {
  it('prepends component border-width reset before user utilities', () => {
    const css = withUniAppXWebPreflightReset('*,::before{border:0 solid;}.border{border-width:1px;}', true)

    expect(css).toContain('uni-app uni-view')
    expect(css).toContain('{border-width:0;}')
    expect(css.indexOf(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)).toBeLessThan(css.indexOf('.border{border-width:1px;}'))
  })

  it('places the reset after the uni-app x framework medium border rule', () => {
    const css = withUniAppXWebPreflightReset('uni-app uni-view{position:relative;border-width:medium}.border{border-width:1px;}', true)

    expect(css.indexOf(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)).toBeGreaterThan(css.indexOf('border-width:medium'))
    expect(css.indexOf(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)).toBeLessThan(css.indexOf('.border{border-width:1px;}'))
  })

  it('repositions an existing reset after a later framework medium border rule', () => {
    const css = withUniAppXWebPreflightReset(`${UNI_APP_X_WEB_PREFLIGHT_RESET_CSS}\nuni-app uni-view{border-width:medium}.border{border-width:1px;}`, true)

    expect(css.match(new RegExp(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER, 'g'))).toHaveLength(1)
    expect(css.indexOf(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)).toBeGreaterThan(css.indexOf('border-width:medium'))
  })

  it('does not duplicate a marker-only reset during repositioning', () => {
    const css = withUniAppXWebPreflightReset(`/* ${UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER} */\nuni-app uni-view{border-width:medium}`, true)

    expect(css.match(new RegExp(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER, 'g'))).toHaveLength(1)
    expect(css.indexOf(UNI_APP_X_WEB_PREFLIGHT_RESET_MARKER)).toBeGreaterThan(css.indexOf('border-width:medium'))
  })

  it('does not duplicate the reset or apply it when disabled', () => {
    expect(withUniAppXWebPreflightReset('.card{}', false)).toBe('.card{}')
    expect(withUniAppXWebPreflightReset('.border{border-width:1px;}', true)).toBe('.border{border-width:1px;}')
    expect(withUniAppXWebPreflightReset('div{border-width:medium}', true)).toBe('div{border-width:medium}')
    expect(withUniAppXWebPreflightReset(`${UNI_APP_X_WEB_PREFLIGHT_RESET_CSS}\n.card{}`, true))
      .toBe(`${UNI_APP_X_WEB_PREFLIGHT_RESET_CSS}\n.card{}`)
  })
})
