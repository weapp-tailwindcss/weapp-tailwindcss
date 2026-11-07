import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'
import { normalizeTailwindBannerVersion } from '../helpers/normalizeTailwindBannerVersion'

const require = createRequire(import.meta.url)
const tailwindcssPackageRoot = path.dirname(require.resolve('tailwindcss/package.json'))

const PACKAGE_CSS_ENTRIES = [
  'index.css',
  'preflight.css',
  'theme.css',
  'utilities.css',
] as const

const PACKAGE_CANDIDATES = [
  'bg-red-500',
  'text-blue-500',
  'p-4',
  'w-[100px]',
  'hover:bg-red-500',
]

const OUTPUT_MODES = [
  {
    name: 'weapp-main',
    target: 'weapp',
    styleOptions: { isMainChunk: true },
  },
  {
    name: 'weapp-sub',
    target: 'weapp',
    styleOptions: { isMainChunk: false },
  },
  {
    name: 'web',
    target: 'web',
    styleOptions: undefined,
  },
] as const

async function readPackageCss(entry: string) {
  return await readFile(path.join(tailwindcssPackageRoot, entry), 'utf8')
}

async function loadPackageJson() {
  return JSON.parse(await readFile(path.join(tailwindcssPackageRoot, 'package.json'), 'utf8')) as {
    exports: Record<string, string | Record<string, string>>
  }
}

function compactCss(css: string) {
  return css.replace(/\s+/g, '')
}

describe('Tailwind v4 package CSS entry outputs', () => {
  it('covers every CSS entry exported by the demo Tailwind package', async () => {
    const packageJson = await loadPackageJson()
    const exportedCssEntries = new Set<string>()

    for (const value of Object.values(packageJson.exports)) {
      if (typeof value === 'string' && value.endsWith('.css')) {
        exportedCssEntries.add(path.basename(value))
      }
      else if (typeof value === 'object') {
        for (const nestedValue of Object.values(value)) {
          if (nestedValue.endsWith('.css')) {
            exportedCssEntries.add(path.basename(nestedValue))
          }
        }
      }
    }

    expect([...PACKAGE_CSS_ENTRIES].sort()).toEqual([...exportedCssEntries].sort())
  })

  it.each(PACKAGE_CSS_ENTRIES)('generates stable %s outputs for every target mode', async (entry) => {
    const source = await resolveTailwindV4Source({
      css: await readPackageCss(entry),
      base: tailwindcssPackageRoot,
    })
    const engine = createTailwindV4Engine(source)

    for (const mode of OUTPUT_MODES) {
      const result = await engine.generate({
        candidates: PACKAGE_CANDIDATES,
        target: mode.target,
        styleOptions: mode.styleOptions,
      })

      expect({
        entry,
        mode: mode.name,
        classSet: [...result.classSet],
        css: normalizeTailwindBannerVersion(result.css),
      }).toMatchSnapshot(`${entry} ${mode.name}`)
    }
  })

  it('converts the full Tailwind index CSS differently for mini-program and web targets', async () => {
    const source = await resolveTailwindV4Source({
      css: await readPackageCss('index.css'),
      base: tailwindcssPackageRoot,
    })
    const engine = createTailwindV4Engine(source)
    const weappResult = await engine.generate({
      candidates: PACKAGE_CANDIDATES,
      styleOptions: { isMainChunk: true },
    })
    const webResult = await engine.generate({
      candidates: PACKAGE_CANDIDATES,
      target: 'web',
    })

    expect(weappResult.classSet).toEqual(new Set(PACKAGE_CANDIDATES))
    expect(webResult.classSet).toEqual(new Set(PACKAGE_CANDIDATES))

    const weappCss = compactCss(weappResult.css)
    const webCss = compactCss(webResult.css)

    expect(weappResult.css).toContain('--color-red-500: rgb(251, 44, 54)')
    expect(weappResult.css).toContain('--color-blue-500: rgb(50, 128, 255)')
    expect(weappResult.css).toContain('.w-_b100px_B')
    expect(weappResult.css).toContain('box-sizing: border-box')
    expect(weappResult.css).not.toContain('@layer')
    expect(weappResult.css).not.toContain('oklch(')
    expect(weappResult.css).not.toContain(':hover')
    expect(weappCss).toContain('.bg-red-500{background-color:var(--color-red-500);}')

    expect(webResult.css).toContain('@layer theme, base, components, utilities')
    expect(webResult.css).toContain('--color-red-500: oklch(63.7% 0.237 25.331)')
    expect(webResult.css).toContain('.w-\\[100px\\]')
    expect(webResult.css).toContain(':hover')
    expect(webResult.css).not.toContain('.w-_b100px_B')
    expect(webCss).toContain('.bg-red-500{background-color:var(--color-red-500);}')
  })
})
