import { describe, expect, it } from 'vitest'
import { normalizeTailwindBannerVersion } from './normalizeTailwindBannerVersion'

const banner = (version: string) => `/*! tailwindcss v${version} | MIT License | https://tailwindcss.com */`

describe('Tailwind API CSS 快照的版本规范化', () => {
  it.each(['3.2.2', '4.3.4', '4.3.5', '4.4.0-beta.2'])('让 %s 的版本注释保持稳定', (version) => {
    expect(normalizeTailwindBannerVersion(`${banner(version)}\n.a{color:red}`))
      .toBe(`${banner('<version>')}\n.a{color:red}`)
  })

  it('保留 charset、嵌套 banner 位置、其他注释及声明中的相同字符串', () => {
    const literal = banner('4.3.5')
    const input = `@charset "UTF-8";\n/* vendor v4.3.5 */\n@layer base{\n  ${literal}\n  .a{content:"${literal}"}\n}\n`
    const expected = `@charset "UTF-8";\n/* vendor v4.3.5 */\n@layer base{\n  ${banner('<version>')}\n  .a{content:"${literal}"}\n}\n`

    expect(normalizeTailwindBannerVersion(input)).toBe(expected)
    expect(normalizeTailwindBannerVersion(expected)).toBe(expected)
  })

  it('继续显示样式、许可证及 banner 存在性的真实差异', () => {
    const css = `${banner('4.3.5')}\n.a{color:red}`
    const normalized = normalizeTailwindBannerVersion(css)

    expect(normalizeTailwindBannerVersion(css.replace('color:red', 'color:blue'))).not.toBe(normalized)
    expect(normalizeTailwindBannerVersion(css.replace('MIT License', 'Other License'))).not.toBe(normalized)
    expect(normalizeTailwindBannerVersion('.a{color:red}')).not.toBe(normalized)
  })
})
