import {
  removeTailwindV4PreflightImports,
  removeUnsupportedThemeVendorKeyframes,
} from '@/index'

describe('tailwind v4 theme source css', () => {
  it('removes quoted, url and escaped preflight imports', () => {
    expect(removeTailwindV4PreflightImports('@import "tailwindcss/theme.css";')).toBe('@import "tailwindcss/theme.css";')
    expect(removeTailwindV4PreflightImports('@import "tailwindcss/preflight.css";@import "tailwindcss/theme.css";'))
      .toBe('@import "tailwindcss/theme.css";')
    expect(removeTailwindV4PreflightImports('@import url("tailwindcss/preflight");.btn{color:red}'))
      .toBe('.btn{color:red}')
    expect(removeTailwindV4PreflightImports('@import "broken')).toBe('@import "broken')
  })

  it('removes vendor-prefixed keyframes nested in theme', () => {
    const css = '@theme{:root{--x:1}@-webkit-keyframes spin{to{transform:rotate(1turn)}}@keyframes spin{to{transform:rotate(1turn)}}}'
    const output = removeUnsupportedThemeVendorKeyframes(css)
    expect(output).not.toContain('@-webkit-keyframes')
    expect(output).toContain('@keyframes spin')
    expect(removeUnsupportedThemeVendorKeyframes('@keyframes spin{to{transform:rotate(1turn)}}')).toBe('@keyframes spin{to{transform:rotate(1turn)}}')
    expect(removeUnsupportedThemeVendorKeyframes('@theme{:root{--x:1}')).toBe('@theme{:root{--x:1}')
  })
})
