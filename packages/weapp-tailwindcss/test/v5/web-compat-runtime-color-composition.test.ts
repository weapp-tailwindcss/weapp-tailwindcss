import type { Buffer } from 'node:buffer'
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import pixelmatch from 'pixelmatch'
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import postcss from 'postcss'
import { afterEach, describe, expect, it } from 'vitest'
import weappTailwindcss from '@/postcss'
import { classSelector, dynamicAlphaMix, expectColorDeclarations, runtimeColors } from './fixtures/web-color-declarations'
import { compositionCases } from './fixtures/web-compat-runtime-color-composition'

const require = createRequire(import.meta.url)
const tailwindcssV4Root = path.dirname(require.resolve('tailwindcss/package.json'))
const createdRoots: string[] = []
const TEST_TIMEOUT = 120_000

function createCss() {
  const candidates = new Set(compositionCases.flatMap(item => [
    ...item.baseClasses,
    ...item.colorClasses,
  ]))
  candidates.add('shadow-lg')
  candidates.add('shadow-red-500')
  candidates.add('hover:shadow-red-500')
  candidates.add('focus:ring-teal-600/20')
  candidates.add('dark:drop-shadow-teal-600/20')
  candidates.add('sm:from-teal-600/20')
  candidates.add('before:text-shadow-red-500')
  return [
    '@import "tailwindcss" source(none);',
    `@source inline("${[...candidates].join(' ')}");`,
    '.apply-shadow { @apply shadow-lg shadow-red-500; }',
  ].join('\n')
}

function createBody() {
  const tones = ['red', 'teal', 'arbitrary'] as const
  const probes = compositionCases.flatMap(item => tones.map((tone, index) => {
    const classes = [...item.baseClasses, item.colorClasses[index]].join(' ')
    return `<div class="probe-wrap"><div id="${item.id}-${tone}" class="probe ${item.id === 'text-shadow' ? 'text-probe' : ''} ${classes}">${item.id === 'text-shadow' ? 'Aa' : ''}</div></div>`
  }))
  probes.push('<div class="probe-wrap"><div id="apply-shadow" class="probe apply-shadow"></div></div>')
  probes.push('<div class="probe-wrap"><div id="order-a" class="probe shadow-lg shadow-red-500"></div></div>')
  probes.push('<div class="probe-wrap"><div id="order-b" class="probe shadow-red-500 shadow-lg"></div></div>')
  probes.push('<div class="probe-wrap"><button id="variant-hover" class="probe shadow-lg hover:shadow-red-500"></button></div>')
  probes.push('<div class="probe-wrap"><button id="variant-focus" class="probe ring-2 focus:ring-teal-600/20"></button></div>')
  probes.push('<div class="probe-wrap"><div id="variant-dark" class="probe drop-shadow-md dark:drop-shadow-teal-600/20"></div></div>')
  probes.push('<div class="probe-wrap"><div id="variant-responsive" class="probe bg-linear-to-r from-red-500 sm:from-teal-600/20 to-transparent"></div></div>')
  probes.push('<div class="probe-wrap"><div id="variant-pseudo" class="probe before:text-shadow-red-500"></div></div>')
  return `<main class="dark probe-grid">${probes.join('')}</main>`
}

function createHtml(standardCss: string, compatCss: string) {
  const fixtureCss = [
    'html,body{margin:0;background:#fff}',
    '.probe-grid{display:grid;grid-template-columns:repeat(6,82px);gap:6px;padding:16px}',
    '.probe-wrap{box-sizing:border-box;width:82px;height:72px;padding:18px;background-color:#fff;overflow:visible}',
    '.probe{box-sizing:border-box;width:46px;height:36px;background-color:#111;color:#111}',
    '.text-probe{background-color:#fff;font:700 24px/36px sans-serif;text-align:center}',
  ].join('')
  return `<!doctype html><html><body><iframe id="standard"></iframe><iframe id="compat"></iframe><script>
    const css = ${JSON.stringify(fixtureCss)};
    const body = ${JSON.stringify(createBody())};
    for (const [id, generatedCss] of [['standard', ${JSON.stringify(standardCss)}], ['compat', ${JSON.stringify(compatCss)}]]) {
      const frame = document.getElementById(id);
      frame.style.cssText = 'width:760px;height:900px;border:0';
      frame.srcdoc = '<!doctype html><html><head><style>' + generatedCss + css + '</style></head><body>' + body + '</body></html>';
    }
  </script></body></html>`
}

function comparePngPixels(standardPng: Buffer, compatPng: Buffer) {
  const standard = PNG.sync.read(standardPng)
  const compat = PNG.sync.read(compatPng)
  const diff = new PNG({ width: standard.width, height: standard.height })
  const mismatchedPixels = pixelmatch(standard.data, compat.data, diff.data, standard.width, standard.height, {
    threshold: 0.04,
  })
  return mismatchedPixels / (standard.width * standard.height)
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-runtime-color-composition-'))
  createdRoots.push(root)
  await mkdir(path.join(root, 'node_modules'), { recursive: true })
  await symlink(tailwindcssV4Root, path.join(root, 'node_modules/tailwindcss'), 'dir')
  const css = createCss()
  const cssEntry = path.join(root, 'app.css')
  await writeFile(cssEntry, css, 'utf8')
  return { css, cssEntry }
}

async function generateCss(cssEntry: string, css: string, webCompat: boolean) {
  return (await postcss([
    weappTailwindcss({
      generator: { target: 'web', webCompat },
      packageName: 'tailwindcss',
      scanSources: false,
    }),
  ]).process(css, { from: cssEntry })).css
}

afterEach(async () => {
  await Promise.all(createdRoots.splice(0).map(root => rm(root, { force: true, recursive: true })))
})

describe('Tailwind CSS v4 web compat runtime color composition', () => {
  it('keeps every runtime color producer independent and equivalent to official web output', async () => {
    const fixture = await createFixture()
    const [standardCss, compatCss] = await Promise.all([
      generateCss(fixture.cssEntry, fixture.css, false),
      generateCss(fixture.cssEntry, fixture.css, true),
    ])

    const compatRoot = postcss.parse(compatCss)
    expect(compositionCases).toHaveLength(18)
    for (const item of compositionCases) {
      expect(compatCss, `${item.variable} should remain a runtime reference`).toContain(`var(${item.variable}`)
      for (const [index, candidate] of item.colorClasses.entries()) {
        const color = runtimeColors[index]!
        const expected = [color.fallback]
        if (['shadow', 'inset-shadow', 'drop-shadow', 'text-shadow'].includes(item.id)) {
          expected.push(dynamicAlphaMix(color.dynamic, `--tw-${item.id}-alpha`))
        }
        expectColorDeclarations(compatRoot, classSelector(candidate), item.variable, expected)
      }
    }
    for (const [selector, property, index, alpha, condition] of [
      [`${classSelector('hover:shadow-red-500')}:hover`, '--tw-shadow-color', 0, '--tw-shadow-alpha', /@media\(hover:\s*hover\)/],
      [classSelector('dark:drop-shadow-teal-600/20'), '--tw-drop-shadow-color', 1, '--tw-drop-shadow-alpha', /@media\(prefers-color-scheme:\s*dark\)/],
      [`${classSelector('before:text-shadow-red-500')}::before`, '--tw-text-shadow-color', 0, '--tw-text-shadow-alpha', undefined],
      ['.apply-shadow', '--tw-shadow-color', 0, '--tw-shadow-alpha', undefined],
    ] as const) {
      const color = runtimeColors[index]!
      expectColorDeclarations(compatRoot, selector, property, [color.fallback, dynamicAlphaMix(color.dynamic, alpha)], condition)
    }
    expectColorDeclarations(compatRoot, `${classSelector('focus:ring-teal-600/20')}:focus`, '--tw-ring-color', [runtimeColors[1]!.fallback])
    expectColorDeclarations(compatRoot, classSelector('sm:from-teal-600/20'), '--tw-gradient-from', [runtimeColors[1]!.fallback], /@media\((?:width\s*>=\s*40rem|min-width:\s*40rem)\)/)
    expectColorDeclarations(compatRoot, '::placeholder', 'color', ['currentcolor', 'color-mix(in oklab, currentcolor 50%, transparent)'])

    const browser = await chromium.launch({ headless: true })
    try {
      const page = await browser.newPage({
        colorScheme: 'dark',
        viewport: { width: 1200, height: 1000 },
      })
      await page.setContent(createHtml(standardCss, compatCss), { waitUntil: 'load' })
      await page.waitForFunction(() => {
        const standard = document.querySelector<HTMLIFrameElement>('#standard')?.contentDocument
        const compat = document.querySelector<HTMLIFrameElement>('#compat')?.contentDocument
        return Boolean(standard?.querySelector('#apply-shadow') && compat?.querySelector('#apply-shadow'))
      })

      const results = await page.evaluate((cases) => {
        const tones = ['red', 'teal', 'arbitrary'] as const
        function read(frameId: 'standard' | 'compat', id: string, variable: string, effectProperty: string) {
          const doc = document.querySelector<HTMLIFrameElement>(`#${frameId}`)!.contentDocument!
          const element = doc.querySelector<HTMLElement>(`#${id}`)!
          const style = doc.defaultView!.getComputedStyle(element)
          const rawColor = style.getPropertyValue(variable).trim()
          const canvas = doc.createElement('canvas')
          canvas.width = 1
          canvas.height = 1
          const context = canvas.getContext('2d')!
          context.clearRect(0, 0, 1, 1)
          context.fillStyle = rawColor
          context.fillRect(0, 0, 1, 1)
          return {
            color: [...context.getImageData(0, 0, 1, 1).data],
            effect: style[effectProperty as any] as string,
            rawColor,
          }
        }
        return cases.map(item => ({
          id: item.id,
          tones: tones.map(tone => ({
            tone,
            standard: read('standard', `${item.id}-${tone}`, item.variable, item.effectProperty),
            compat: read('compat', `${item.id}-${tone}`, item.variable, item.effectProperty),
          })),
        }))
      }, compositionCases)

      for (const item of results) {
        for (const tone of item.tones) {
          expect(tone.standard.rawColor, `${item.id}/${tone.tone} standard color`).not.toBe('')
          expect(tone.compat.rawColor, `${item.id}/${tone.tone} compat color`).not.toBe('')
          expect(tone.standard.effect, `${item.id}/${tone.tone} standard effect`).not.toBe('none')
          expect(tone.compat.effect, `${item.id}/${tone.tone} compat effect`).not.toBe('none')
          tone.compat.color.forEach((channel, index) => {
            expect(Math.abs(channel - tone.standard.color[index]), `${item.id}/${tone.tone} rgba channel ${index}`).toBeLessThanOrEqual(2)
          })
        }
        expect(item.tones[0].standard.color, `${item.id} named and opacity colors`).not.toEqual(item.tones[1].standard.color)
        expect(item.tones[0].compat.color, `${item.id} compat named and opacity colors`).not.toEqual(item.tones[1].compat.color)
      }

      const applyColors = await page.evaluate(() => {
        function read(frameId: 'standard' | 'compat') {
          const doc = document.querySelector<HTMLIFrameElement>(`#${frameId}`)!.contentDocument!
          return doc.defaultView!.getComputedStyle(doc.querySelector('#apply-shadow')!).boxShadow
        }
        return { standard: read('standard'), compat: read('compat') }
      })
      expect(applyColors.standard).not.toBe('none')
      expect(applyColors.compat).not.toBe('none')

      async function readVariantValues(frameId: 'standard' | 'compat') {
        await page.frameLocator(`#${frameId}`).locator('#variant-hover').hover()
        await page.frameLocator(`#${frameId}`).locator('#variant-focus').focus()
        return page.frameLocator(`#${frameId}`).locator('body').evaluate((body) => {
          const doc = body.ownerDocument
          const view = doc.defaultView!
          return {
            hover: view.getComputedStyle(doc.querySelector('#variant-hover')!).getPropertyValue('--tw-shadow-color').trim(),
            focus: view.getComputedStyle(doc.querySelector('#variant-focus')!).getPropertyValue('--tw-ring-color').trim(),
            dark: view.getComputedStyle(doc.querySelector('#variant-dark')!).getPropertyValue('--tw-drop-shadow-color').trim(),
            responsive: view.getComputedStyle(doc.querySelector('#variant-responsive')!).getPropertyValue('--tw-gradient-from').trim(),
            pseudo: view.getComputedStyle(doc.querySelector('#variant-pseudo')!, '::before').getPropertyValue('--tw-text-shadow-color').trim(),
            orderA: view.getComputedStyle(doc.querySelector('#order-a')!).boxShadow,
            orderB: view.getComputedStyle(doc.querySelector('#order-b')!).boxShadow,
          }
        })
      }
      const variantValues = {
        standard: await readVariantValues('standard'),
        compat: await readVariantValues('compat'),
      }
      for (const key of ['hover', 'focus', 'dark', 'responsive', 'pseudo'] as const) {
        expect(variantValues.standard[key], `${key} standard runtime color`).not.toBe('')
        expect(variantValues.compat[key], `${key} compat runtime color`).not.toBe('')
      }
      expect(variantValues.standard.orderA).toBe(variantValues.standard.orderB)
      expect(variantValues.compat.orderA).toBe(variantValues.compat.orderB)

      const [standardShot, compatShot] = await Promise.all([
        page.frameLocator('#standard').locator('.probe-grid').screenshot(),
        page.frameLocator('#compat').locator('.probe-grid').screenshot(),
      ])
      expect(comparePngPixels(standardShot, compatShot)).toBeLessThan(0.04)
    }
    finally {
      await browser.close()
    }
  }, TEST_TIMEOUT)
})
