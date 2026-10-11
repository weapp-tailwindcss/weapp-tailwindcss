import { describe, expect, it } from 'vitest'
import {
  createCssAppend,
  hasTailwindGeneratedCss,
  hasTailwindGeneratedCssMarkers,
  removeTailwindGeneratedCssByBanner,
  splitGeneratorPlaceholderCssBySourceOrder,
  splitTailwindGeneratedCssByBanner,
  splitTailwindV4GeneratedCss,
  splitTailwindV4GeneratedCssBySourceOrder,
  stripGeneratorPlaceholderMarkers,
  stripTailwindBanner,
  stripTailwindBanners,
} from '@/generation/markers'

describe('generator css markers', () => {
  it('appends css and strips generated banners and placeholders', () => {
    expect(createCssAppend('', '.extra{}')).toBe('.extra{}')
    expect(createCssAppend('.base{}', '')).toBe('.base{}')
    expect(createCssAppend('.base{}', '.extra{}')).toBe('.base{}\n.extra{}')

    expect(stripTailwindBanner('/*! tailwindcss v4.0.0 */\n.keep{}')).toBe('.keep{}')
    expect(stripTailwindBanners('/*! tailwindcss v4.0.0 */\n.keep{}\n/*! tailwindcss v4.1.0 */\n.next{}')).toBe('.keep{}\n.next{}')
    expect(stripGeneratorPlaceholderMarkers('/*! weapp-tailwindcss generator-placeholder */\n.keep{}')).toBe('.keep{}')
  })

  it('splits generated css by source order and banner markers', () => {
    expect(splitTailwindV4GeneratedCss('.raw{}', '.raw{}')).toBe('')
    expect(splitTailwindV4GeneratedCss('.raw{}\n.after{}', '.raw{}')).toBe('\n.after{}')
    expect(splitTailwindV4GeneratedCssBySourceOrder('.before{}\n.generated{}\n.after{}', '.generated{}')).toEqual({
      before: '.before{}\n',
      after: '\n.after{}',
    })
    expect(splitTailwindV4GeneratedCssBySourceOrder('.before{}', '.missing{}')).toBeUndefined()

    expect(splitGeneratorPlaceholderCssBySourceOrder('.before{}\n/*! weapp-tailwindcss generator-placeholder */\n.generated{}\n.after{}', '.generated{}')).toEqual({
      before: '.before{}\n',
      after: '.after{}',
    })
    expect(splitGeneratorPlaceholderCssBySourceOrder('.before{}')).toBeUndefined()

    const bannerCss = '.before{}\n/*! tailwindcss v4.0.0 */\n/*$vite$:src/app.css*/\n.generated{}'
    expect(splitTailwindGeneratedCssByBanner(bannerCss)).toEqual({
      before: '.before{}\n',
      after: '/*$vite$:src/app.css*/',
    })
    expect(removeTailwindGeneratedCssByBanner(bannerCss)).toBe('.before{}\n\n/*$vite$:src/app.css*/')
    expect(removeTailwindGeneratedCssByBanner('.plain{}')).toBeUndefined()
  })

  it('detects generated css markers without false positives', () => {
    expect(hasTailwindGeneratedCss('/*! tailwindcss v4.0.0 */')).toBe(true)
    expect(hasTailwindGeneratedCss('.plain{}')).toBe(false)
    expect(hasTailwindGeneratedCssMarkers('.hover\\:text-red-500{}')).toBe(true)
    expect(hasTailwindGeneratedCssMarkers(':host,page,.tw-root,wx-root-portal-content{--color-red-500:red}')).toBe(true)
    expect(hasTailwindGeneratedCssMarkers(':root,:host{--font-sans:ui-sans-serif}')).toBe(true)
    expect(hasTailwindGeneratedCssMarkers('/*! weapp-tailwindcss generator-placeholder */')).toBe(true)
    expect(hasTailwindGeneratedCssMarkers('.plain{color:red}')).toBe(false)
  })

  it('does not treat user page custom properties as generated Tailwind theme css', () => {
    expect(hasTailwindGeneratedCssMarkers([
      'page {',
      '  --test-color: #006241;',
      '  --color-test: #006241;',
      '  --font-test: "Issue 978", sans-serif;',
      '  --font-sans: "inter", "inter Fallback", system-ui;',
      '  --font-serif: ui-serif, Georgia, Cambria, "Times New Roman", Times, serif;',
      '  --font-mono: var(--font-plex-mono), monospace;',
      '  --color-red-50: #fef2f2;',
      '  --color-red-500: #fb2c36;',
      '  --color-red-950: #460809;',
      '  --color-blue-500: #3080ff;',
      '  --color-slate-900: #0f172b;',
      '  --spacing: .25rem;',
      '  --text-base: 1rem;',
      '  --font-weight-bold: 700;',
      '  --radius-lg: .5rem;',
      '  --default-font-family: var(--font-inter), system-ui;',
      '  --default-mono-font-family: var(--font-plex-mono), monospace;',
      '}',
    ].join('\n'))).toBe(false)
    expect(hasTailwindGeneratedCssMarkers(':host,page,.tw-root,wx-root-portal-content{--spacing:.25rem}')).toBe(true)
    expect(hasTailwindGeneratedCssMarkers(':host,page,.tw-root,wx-root-portal-content{--color-red-500:red}')).toBe(true)
    expect(hasTailwindGeneratedCssMarkers(':host,page,.tw-root,wx-root-portal-content{--font-sans:ui-sans-serif}')).toBe(true)
  })
})
