import type { Buffer } from 'node:buffer'
import type { Page } from 'playwright'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import postcss from 'postcss'
import { afterEach, describe, expect, it } from 'vitest'
import weappTailwindcss from '@/postcss'

const require = createRequire(import.meta.url)
const tailwindcssV4Root = path.dirname(require.resolve('tailwindcss/package.json'))
const iconifyRoot = path.dirname(require.resolve('@iconify/tailwind4/package.json'))
const TEST_TIMEOUT = 120_000
const createdRoots: string[] = []

const TAILWIND_V4_SURFACE_CANDIDATES = [
  'relative',
  'block',
  'inline-block',
  'flex',
  'inline-flex',
  'grid',
  'hidden',
  'flex-col',
  'grid-cols-[repeat(3,minmax(0,1fr))]',
  'auto-rows-[minmax(0,auto)]',
  'items-center',
  'justify-between',
  'gap-3',
  'gap-x-[clamp(12px,2vw,28px)]',
  'gap-y-4',
  'space-y-2',
  'space-x-2',
  'p-4',
  'px-[calc(var(--spacing-card)*2)]',
  'py-[18px]',
  'm-[3px_5px_7px_11px]',
  'size-[42px]',
  'min-h-dvh',
  'max-w-[min(72rem,calc(100vw-2rem))]',
  'aspect-[16/9]',
  'overflow-hidden',
  'rounded-full',
  'rounded-[28px]',
  'border',
  'border-slate-200/80',
  '!border-brand',
  'bg-brand',
  'bg-accent/70',
  'bg-gradient-to-br',
  'from-slate-900/95',
  'via-accent/75',
  'to-slate-700/95',
  'text-white',
  'text-[#123456]',
  'text-[length:clamp(14px,2vw,20px)]',
  'font-semibold',
  'tracking-wide',
  'leading-tight',
  'underline',
  'decoration-brand',
  'decoration-2',
  'underline-offset-4',
  'shadow-xl',
  'shadow-lg',
  'shadow-red-500',
  'shadow-teal-600/20',
  'shadow-[0_18px_70px_rgba(15,23,42,0.24)]',
  'ring-2',
  'ring-brand/30',
  'outline-none',
  'opacity-90',
  'blur-[1px]',
  'backdrop-blur-md',
  'brightness-110',
  'contrast-125',
  'rotate-[2deg]',
  '-translate-y-[3px]',
  'scale-[1.03]',
  'transform-gpu',
  'origin-top-left',
  'transition-[transform,opacity,box-shadow]',
  'duration-[375ms]',
  'ease-[cubic-bezier(.16,1,.3,1)]',
  'animate-wiggle',
  '[--card-gap:18px]',
  '[mask-image:linear-gradient(to_bottom,black,transparent)]',
  'selection:bg-brand/20',
  'marker:text-brand',
  'placeholder:text-brand/60',
  'first-letter:text-4xl',
  'before:absolute',
  'before:inset-0',
  'before:content-[attr(data-label)]',
  'after:block',
  'after:h-px',
  'after:bg-brand/25',
  'hover:bg-brand/80',
  'hover:[box-shadow:0_0_0_3px_var(--color-brand)]',
  'active:scale-95',
  'focus-visible:ring-4',
  'disabled:opacity-40',
  'aria-expanded:bg-accent',
  'data-[state=open]:grid',
  'data-[density=compact]:gap-2',
  'group-hover/card:translate-x-2',
  'peer-checked:opacity-100',
  'has-[img]:p-0',
  '[&>*]:min-w-0',
  '[&_svg]:size-4',
  '[&:nth-child(3)]:text-brand',
  'supports-[display:grid]:grid',
  '[@media_(min-width:37rem)]:grid-cols-3',
  'xs:grid-cols-2',
  'md:grid-cols-4',
  'dark:bg-zinc-950',
  'dark:hover:bg-zinc-900',
  'any-hover:bg-accent',
  'i-[tst--home]',
  'icon-[tst--wide]',
]

function createParityCss(iconSetFile: string) {
  const normalizedIconSetFile = iconSetFile.replace(/\\/g, '/')
  return [
    '@import "tailwindcss" source(none);',
    '',
    '@plugin "@iconify/tailwind4" {',
    '  prefix: "i";',
    '  scale: 1.25;',
    `  icon-sets: from-json(tst, "${normalizedIconSetFile}");`,
    '}',
    '@plugin "@iconify/tailwind4" {',
    '  prefix: "icon";',
    '  prefixes: tst;',
    '  icon-selector: ".ic-{prefix}-{name}";',
    '  mask-selector: ".mask-icon";',
    '  background-selector: ".bg-icon";',
    '  var-name: "icon";',
    '  square: false;',
    '  scale: 1.5;',
    `  icon-sets: from-json(tst, "${normalizedIconSetFile}");`,
    '}',
    '',
    '@theme {',
    '  --color-brand: #155dfc;',
    '  --color-accent: oklch(70% 0.17 162);',
    '  --color-slate-200: oklch(92.9% .013 255.508);',
    '  --color-slate-700: oklch(37.2% .044 257.287);',
    '  --color-slate-900: oklch(20.8% .042 265.755);',
    '  --color-zinc-900: #18181b;',
    '  --color-zinc-950: #09090b;',
    '  --spacing-card: 18px;',
    '  --breakpoint-xs: 30rem;',
    '  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);',
    '  --animate-wiggle: wiggle 1s ease-in-out infinite;',
    '  @keyframes wiggle {',
    '    0%, 100% { transform: rotate(-3deg); }',
    '    50% { transform: rotate(3deg); }',
    '  }',
    '}',
    '',
    '@custom-variant dark (&:where(.dark, .dark *));',
    '@custom-variant any-hover {',
    '  @media (any-hover: hover) {',
    '    &:hover {',
    '      @slot;',
    '    }',
    '  }',
    '}',
    `@source inline("${TAILWIND_V4_SURFACE_CANDIDATES.join(' ')}");`,
    '',
  ].join('\n')
}

const TEST_ICON_SET = {
  prefix: 'tst',
  icons: {
    home: {
      body: '<path d="M1 7L8 1l7 6v8H1z"/>',
      width: 16,
      height: 16,
    },
    wide: {
      body: '<path d="M0 0h24v12H0z"/>',
      width: 24,
      height: 12,
    },
  },
}

const STYLE_PROPERTIES = [
  'display',
  'position',
  'width',
  'height',
  'minHeight',
  'maxWidth',
  'aspectRatio',
  'overflow',
  'gridTemplateColumns',
  'gridAutoRows',
  'alignItems',
  'justifyContent',
  'flexDirection',
  'gap',
  'columnGap',
  'rowGap',
  'marginTop',
  'marginRight',
  'marginBottom',
  'marginLeft',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'borderTopWidth',
  'borderTopStyle',
  'borderRadius',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'textDecorationLine',
  'textDecorationThickness',
  'textUnderlineOffset',
  'outlineStyle',
  'opacity',
  'filter',
  'backdropFilter',
  'transform',
  'transformOrigin',
  'transitionProperty',
  'transitionDuration',
  'transitionTimingFunction',
  'animationName',
  'maskImage',
  'webkitMaskImage',
  'maskSize',
  'webkitMaskSize',
  'maskRepeat',
  'webkitMaskRepeat',
] as const

const PSEUDO_STYLE_PROPERTIES = [
  'display',
  'position',
  'insetBlockStart',
  'insetInlineStart',
  'width',
  'height',
  'content',
  'fontSize',
] as const

const COLOR_AND_PAINT_PROPERTIES = [
  'backgroundColor',
  'backgroundImage',
  'borderTopColor',
  'boxShadow',
  'color',
  'textDecorationColor',
] as const

async function createFixtureRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-web-compat-parity-'))
  createdRoots.push(root)
  await mkdir(path.join(root, 'node_modules', '@iconify'), { recursive: true })
  const linkType = process.platform === 'win32' ? 'junction' : 'dir'
  await symlink(tailwindcssV4Root, path.join(root, 'node_modules', 'tailwindcss'), linkType)
  await symlink(iconifyRoot, path.join(root, 'node_modules', '@iconify', 'tailwind4'), linkType)
  const iconSetFile = path.join(root, 'test-icons.json')
  await writeFile(iconSetFile, JSON.stringify(TEST_ICON_SET), 'utf8')
  const css = createParityCss(iconSetFile)
  const cssEntry = path.join(root, 'src/app.css')
  await mkdir(path.dirname(cssEntry), { recursive: true })
  await writeFile(cssEntry, css, 'utf8')
  return { root, css, cssEntry }
}

async function generateWebCss(cssEntry: string, css: string, webCompat: boolean) {
  const result = await postcss([
    weappTailwindcss({
      generator: {
        target: 'web',
        webCompat,
      },
      packageName: 'tailwindcss',
      scanSources: false,
    }),
  ]).process(css, {
    from: cssEntry,
  })
  return result.css
}

function normalizeCssValue(value: string) {
  return value
    .replace(/\s+/g, ' ')
    .replace(/, /g, ',')
    .replace(/\b0px\b/g, '0')
    .replace(/-?\d+\.\d+/g, match => Number(match).toFixed(5).replace(/\.?0+$/, ''))
    .replace(/\b(?:\d+(?:\.\d+)?e\+\d+|\d{5,})px\b/gi, '9999px')
    .trim()
}

function comparePngPixels(standardPng: Buffer, compatPng: Buffer) {
  const standard = PNG.sync.read(standardPng)
  const compat = PNG.sync.read(compatPng)
  expect(compat.width).toBe(standard.width)
  expect(compat.height).toBe(standard.height)
  const diff = new PNG({
    width: standard.width,
    height: standard.height,
  })
  const mismatchedPixels = pixelmatch(standard.data, compat.data, diff.data, standard.width, standard.height, {
    threshold: 0.04,
  })
  let totalChannelDelta = 0
  let maxPixelDelta = 0
  for (let index = 0; index < standard.data.length; index += 4) {
    const pixelDelta
      = Math.abs(standard.data[index] - compat.data[index])
        + Math.abs(standard.data[index + 1] - compat.data[index + 1])
        + Math.abs(standard.data[index + 2] - compat.data[index + 2])
        + Math.abs(standard.data[index + 3] - compat.data[index + 3])
    totalChannelDelta += pixelDelta
    maxPixelDelta = Math.max(maxPixelDelta, pixelDelta)
  }
  const totalPixels = standard.width * standard.height
  return {
    averageChannelDelta: totalChannelDelta / (totalPixels * 4),
    maxPixelDelta,
    mismatchedPixels,
    mismatchRatio: mismatchedPixels / totalPixels,
  }
}

function createParityHtml(standardCss: string, compatCss: string) {
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      body { margin: 0; padding: 24px; font-family: sans-serif; }
      iframe { width: 760px; height: 720px; border: 0; }
    </style>
  </head>
  <body>
    <iframe id="standard"></iframe>
    <iframe id="compat"></iframe>
    <script>
      const standardCss = ${JSON.stringify(standardCss)};
      const compatCss = ${JSON.stringify(compatCss)};
      const body = ${JSON.stringify(createFixtureBody())};
      for (const [id, css] of [['standard', standardCss], ['compat', compatCss]]) {
        const frame = document.getElementById(id);
        frame.srcdoc = '<!doctype html><html><head><style>' + css + '</style></head><body>' + body + '</body></html>';
      }
    </script>
  </body>
</html>
`
}

function createFixtureBody() {
  return `
<main class="dark" style="width: 680px;">
  <section id="card" data-label="badge" class="relative flex flex-col gap-3 rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-slate-900/95 via-accent/75 to-slate-700/95 p-4 text-white shadow-xl before:absolute before:inset-0 before:content-[attr(data-label)] after:block after:h-px after:bg-brand/25">
    <div id="layout" class="grid grid-cols-[repeat(3,minmax(0,1fr))] auto-rows-[minmax(0,auto)] items-center justify-between gap-x-[clamp(12px,2vw,28px)] gap-y-4 px-[calc(var(--spacing-card)*2)] py-[18px]"></div>
    <div id="spacing" class="space-y-2"><div>one</div><div id="space-y-child">two</div></div>
    <div id="inline" class="m-[3px_5px_7px_11px] size-[42px] min-h-dvh max-w-[min(72rem,calc(100vw-2rem))] aspect-[16/9] overflow-hidden"></div>
    <button id="interactive" aria-expanded="true" data-state="open" data-density="compact" class="block rounded-full !border-brand bg-brand text-[length:clamp(14px,2vw,20px)] font-semibold leading-tight tracking-wide underline decoration-brand decoration-2 underline-offset-4 ring-2 ring-brand/30 outline-none opacity-90 hover:bg-brand/80 hover:[box-shadow:0_0_0_3px_var(--color-brand)] active:scale-95 focus-visible:ring-4 aria-expanded:bg-accent data-[state=open]:grid data-[density=compact]:gap-2 any-hover:bg-accent">button</button>
    <input id="input" class="placeholder:text-brand/60 disabled:opacity-40" placeholder="placeholder" disabled>
    <div id="motion" class="shadow-[0_18px_70px_rgba(15,23,42,0.24)] blur-[1px] backdrop-blur-md brightness-110 contrast-125 rotate-[2deg] -translate-y-[3px] scale-[1.03] transform-gpu origin-top-left transition-[transform,opacity,box-shadow] duration-[375ms] ease-[cubic-bezier(.16,1,.3,1)] animate-wiggle [--card-gap:18px] [mask-image:linear-gradient(to_bottom,black,transparent)]"></div>
    <div id="shadow-red" class="shadow-lg shadow-red-500"></div>
    <div id="shadow-teal" class="shadow-lg shadow-teal-600/20"></div>
    <div id="group" class="group/card"><span id="group-child" class="inline-block group-hover/card:translate-x-2">group</span></div>
    <input id="peer-source" class="peer" type="checkbox" checked><span id="peer-target" class="opacity-90 peer-checked:opacity-100">peer</span>
    <div id="has-image" class="has-[img]:p-0 p-4"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" alt=""></div>
    <div id="nested" class="[&>*]:min-w-0 [&_svg]:size-4 [&:nth-child(3)]:text-brand supports-[display:grid]:grid [@media_(min-width:37rem)]:grid-cols-3 xs:grid-cols-2 md:grid-cols-4"><span>one</span><span>two</span><span id="nth-child">three</span><svg id="nested-svg"></svg></div>
    <div id="dark-target" class="dark:bg-zinc-950 dark:hover:bg-zinc-900"></div>
    <i id="icon-i" class="i-[tst--home] text-[#123456]"></i>
    <i id="icon-custom" class="icon-[tst--wide] text-[#123456]"></i>
    <ul id="list" class="marker:text-brand"><li>item</li></ul>
    <p id="first-letter" class="first-letter:text-4xl">Alpha</p>
  </section>
  <section id="paint-card" data-label="badge" style="width: 240px; height: 160px;" class="relative rounded-[28px] border border-slate-200/80 bg-gradient-to-br from-slate-900/95 via-accent/75 to-slate-700/95 p-4 text-white shadow-xl before:absolute before:inset-0 before:content-[attr(data-label)] after:block after:h-px after:bg-brand/25"></section>
</main>
`
}

async function waitForFrames(page: Page) {
  await page.waitForFunction(() => {
    const standard = document.querySelector<HTMLIFrameElement>('#standard')?.contentDocument
    const compat = document.querySelector<HTMLIFrameElement>('#compat')?.contentDocument
    return Boolean(standard?.querySelector('#card') && compat?.querySelector('#card'))
  })
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

describe('Tailwind CSS v4 web compat computed parity', () => {
  it('loads configured CSS plugins from the temporary fixture dependency root', async () => {
    const fixture = await createFixtureRoot()
    const css = await generateWebCss(fixture.cssEntry, fixture.css, false)

    expect(css).toContain('.i-\\[tst--home\\]')
    expect(css).toContain('.icon-\\[tst--wide\\]')
    expect(css).toContain('data:image/svg+xml')
  })

  it('keeps webCompat on and off visually equivalent in the browser for the Tailwind v4 utility surface', async () => {
    const fixture = await createFixtureRoot()
    const [standardCss, compatCss] = await Promise.all([
      generateWebCss(fixture.cssEntry, fixture.css, false),
      generateWebCss(fixture.cssEntry, fixture.css, true),
    ])

    expect(standardCss).toContain('@layer')
    expect(compatCss).not.toContain('@layer')
    expect(compatCss).not.toContain('@property')
    expect(compatCss).toContain('rgba(')
    expect(compatCss).not.toContain('oklch(')
    expect(compatCss).not.toContain('var(--color-')
    expect(compatCss).toContain('.bg-gradient-to-br')
    expect(compatCss).toContain('.i-\\[tst--home\\]')
    expect(compatCss).toContain('.icon-\\[tst--wide\\]')
    expect(compatCss).toMatch(/--tw-shadow:\s*0 10px 15px -3px var\(--tw-shadow-color,/)

    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({
        viewport: {
          width: 900,
          height: 900,
        },
      })
      await page.setContent(createParityHtml(standardCss, compatCss), { waitUntil: 'load' })
      await waitForFrames(page)
      for (const frameId of ['standard', 'compat'] as const) {
        await page.frameLocator(`#${frameId}`).locator('body').evaluate((body) => {
          const style = body.ownerDocument.createElement('style')
          style.textContent = '*,::before,::after{animation:none!important;transition:none!important;caret-color:transparent!important;}'
          body.ownerDocument.head.append(style)
        })
      }

      for (const selector of [
        '#card',
        '#layout',
        '#spacing',
        '#space-y-child',
        '#inline',
        '#interactive',
        '#input',
        '#motion',
        '#group-child',
        '#peer-target',
        '#has-image',
        '#nested',
        '#nth-child',
        '#nested-svg',
        '#dark-target',
        '#icon-i',
        '#icon-custom',
        '#list li',
        '#first-letter',
      ]) {
        const values = await page.evaluate(({ selector, properties }) => {
          function read(frameId: 'standard' | 'compat') {
            const doc = document.querySelector<HTMLIFrameElement>(`#${frameId}`)!.contentDocument!
            const element = doc.querySelector(selector)!
            const style = doc.defaultView!.getComputedStyle(element)
            return Object.fromEntries(properties.map(property => [property, style[property as any]]))
          }
          return {
            standard: read('standard'),
            compat: read('compat'),
          }
        }, { selector, properties: STYLE_PROPERTIES })

        expect(
          Object.fromEntries(Object.entries(values.compat).map(([key, value]) => [key, normalizeCssValue(String(value))])),
          `${selector} should compute the same styles with webCompat enabled`,
        ).toEqual(
          Object.fromEntries(Object.entries(values.standard).map(([key, value]) => [key, normalizeCssValue(String(value))])),
        )
      }

      for (const selector of ['#card', '#interactive', '#motion', '#icon-i', '#icon-custom']) {
        const values = await page.evaluate(({ selector, properties }) => {
          function read(frameId: 'standard' | 'compat') {
            const doc = document.querySelector<HTMLIFrameElement>(`#${frameId}`)!.contentDocument!
            const element = doc.querySelector(selector)!
            const style = doc.defaultView!.getComputedStyle(element)
            return Object.fromEntries(properties.map(property => [property, style[property as any]]))
          }
          return {
            standard: read('standard'),
            compat: read('compat'),
          }
        }, { selector, properties: COLOR_AND_PAINT_PROPERTIES })

        if (values.standard.backgroundImage === 'none') {
          expect(values.compat.backgroundImage, `${selector} compat background image should stay empty`).toBe('none')
        }
        else {
          expect(values.compat.backgroundImage, `${selector} compat background image should not disappear`).not.toBe('none')
        }
        expect(values.compat.borderTopColor, `${selector} compat border color should be resolved`).not.toBe('')
      }

      const shadowValues = await page.evaluate(() => {
        function read(frameId: 'standard' | 'compat', selector: string) {
          const doc = document.querySelector<HTMLIFrameElement>(`#${frameId}`)!.contentDocument!
          return doc.defaultView!.getComputedStyle(doc.querySelector(selector)!).boxShadow
        }
        return {
          standardRed: read('standard', '#shadow-red'),
          standardTeal: read('standard', '#shadow-teal'),
          compatRed: read('compat', '#shadow-red'),
          compatTeal: read('compat', '#shadow-teal'),
        }
      })

      expect(normalizeCssValue(shadowValues.standardRed)).not.toBe(normalizeCssValue(shadowValues.standardTeal))
      expect(normalizeCssValue(shadowValues.compatRed)).not.toBe(normalizeCssValue(shadowValues.compatTeal))

      for (const pseudo of ['::before', '::after', '::first-letter'] as const) {
        const values = await page.evaluate(({ pseudo, properties }) => {
          function read(frameId: 'standard' | 'compat') {
            const doc = document.querySelector<HTMLIFrameElement>(`#${frameId}`)!.contentDocument!
            const element = doc.querySelector(pseudo === '::first-letter' ? '#first-letter' : '#card')!
            const style = doc.defaultView!.getComputedStyle(element, pseudo)
            return Object.fromEntries(properties.map(property => [property, style[property as any]]))
          }
          return {
            standard: read('standard'),
            compat: read('compat'),
          }
        }, { pseudo, properties: PSEUDO_STYLE_PROPERTIES })

        expect(
          Object.fromEntries(Object.entries(values.compat).map(([key, value]) => [key, normalizeCssValue(String(value))])),
          `${pseudo} should compute the same styles with webCompat enabled`,
        ).toEqual(
          Object.fromEntries(Object.entries(values.standard).map(([key, value]) => [key, normalizeCssValue(String(value))])),
        )
      }

      const [standardShot, compatShot] = await Promise.all([
        page.frameLocator('#standard').locator('#paint-card').screenshot(),
        page.frameLocator('#compat').locator('#paint-card').screenshot(),
      ])
      const screenshotDiff = comparePngPixels(standardShot, compatShot)
      expect(screenshotDiff.averageChannelDelta, 'webCompat should keep the rendered screen within the legacy color fallback tolerance').toBeLessThan(6)
      expect(screenshotDiff.maxPixelDelta, 'webCompat should not drop any painted region from the rendered screen').toBeLessThan(80)
      expect(screenshotDiff.mismatchRatio, 'webCompat should not create broad visual regressions').toBeLessThan(0.55)

      for (const frameId of ['standard', 'compat'] as const) {
        await page.frameLocator(`#${frameId}`).locator('#interactive').hover()
      }
      const hoverValues = await page.evaluate(({ properties }) => {
        function read(frameId: 'standard' | 'compat') {
          const doc = document.querySelector<HTMLIFrameElement>(`#${frameId}`)!.contentDocument!
          const style = doc.defaultView!.getComputedStyle(doc.querySelector('#interactive')!)
          return Object.fromEntries(properties.map(property => [property, style[property as any]]))
        }
        return {
          standard: read('standard'),
          compat: read('compat'),
        }
      }, { properties: ['display', 'gap'] })

      expect(
        Object.fromEntries(Object.entries(hoverValues.compat).map(([key, value]) => [key, normalizeCssValue(String(value))])),
        'hover, aria, data, and any-hover variants should compute the same styles',
      ).toEqual(
        Object.fromEntries(Object.entries(hoverValues.standard).map(([key, value]) => [key, normalizeCssValue(String(value))])),
      )
    }
    finally {
      await browser.close()
    }
  }, TEST_TIMEOUT)
})
