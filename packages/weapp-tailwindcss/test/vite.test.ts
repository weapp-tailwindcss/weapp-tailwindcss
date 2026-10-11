import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import tailwindcss from '@tailwindcss/postcss'
import twv from '@tailwindcss/vite'
import { isCI } from 'ci-info'
import fs from 'fs-extra'
import path from 'pathe'
import { build } from 'vite'
import { afterAll } from 'vitest'
import { WeappTailwindcss } from '@/vite'
import { fixturesRootPath } from './util'

const tailwindcssBannerPattern = /\/\*! tailwindcss v[\d.]+ \| MIT License \| https:\/\/tailwindcss\.com \*\//g

function normalizeTailwindcssBanner(content: string) {
  return content.replaceAll(
    tailwindcssBannerPattern,
    '/*! tailwindcss v<version> | MIT License | https://tailwindcss.com */',
  )
}

async function readBuiltStyle(root: string) {
  const dist = path.resolve(root, 'dist')
  const entries = await fs.readdir(dist, { withFileTypes: true })
  const styleEntry = entries.find((entry) => {
    if (!entry.isFile() || path.parse(entry.name).name !== 'index') {
      return false
    }
    return !['.html', '.js', '.map'].includes(path.extname(entry.name))
  })
  if (!styleEntry) {
    throw new Error(`Vite build did not emit an index style asset: ${entries.map(entry => entry.name).join(', ')}`)
  }
  return fs.readFile(path.join(dist, styleEntry.name), 'utf-8')
}

const require = createRequire(import.meta.url)
const tailwindcss4Basedir = path.dirname(require.resolve('tailwindcss/package.json'))
const previousTailwindcssBasedir = process.env.WEAPP_TAILWINDCSS_BASEDIR
if (previousTailwindcssBasedir === undefined) {
  process.env.WEAPP_TAILWINDCSS_BASEDIR = tailwindcss4Basedir
}

afterAll(() => {
  if (previousTailwindcssBasedir === undefined) {
    delete process.env.WEAPP_TAILWINDCSS_BASEDIR
  }
  else {
    process.env.WEAPP_TAILWINDCSS_BASEDIR = previousTailwindcssBasedir
  }
})

describe.skipIf(isCI)('vite', () => {
  it('v4-vite-plugin generator force owns Tailwind output when official plugin is also registered', async () => {
    const root = await mkdtemp(path.join(fixturesRootPath, 'v4-vite-force-own-'))
    await writeFile(path.join(root, 'index.html'), [
      '<div class="w-[100px] text-[#123456]"></div>',
      '<script type="module" src="./index.ts"></script>',
    ].join('\n'))
    await writeFile(path.join(root, 'index.ts'), 'import "./index.css"\n')
    await writeFile(path.join(root, 'index.css'), [
      '@import "tailwindcss";',
      '@source inline("w-[100px] text-[#123456]");',
      '.card:hover { color: red; }',
    ].join('\n'))

    try {
      await build({
        root,
        plugins: [
          twv(),
          WeappTailwindcss({
            generator: { target: 'weapp' },
            tailwindcssBasedir: tailwindcss4Basedir,
            tailwindcss: {
              packageName: 'tailwindcss',
            },
            cssEntries: [path.join(root, 'index.css')],
          }),
        ],
        resolve: {
          alias: [
            { find: /^tailwindcss$/, replacement: path.join(tailwindcss4Basedir, 'index.css') },
            { find: /^tailwindcss\//, replacement: `${tailwindcss4Basedir}/` },
          ],
        },
        build: {
          minify: false,
          rollupOptions: {
            output: {
              assetFileNames: '[name].[ext]',
              entryFileNames: '[name].js',
              chunkFileNames: '[name].js',
            },
          },
        },
      })

      const css = await readBuiltStyle(root)
      expect(css).toContain('.w-_b100px_B')
      expect(css).toContain('width: 100px')
      expect(css).toContain('.text-_b_h123456_B')
      expect(css).not.toContain('tailwindcss v')
      expect(css).not.toContain('@property')
      expect(css).not.toContain('@import "tailwindcss4"')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 120_000)

  it('v4-vite-plugin', async () => {
    const root = path.resolve(fixturesRootPath, 'v4-vite-plugin')
    await build({
      root,
      plugins: [
        twv(),
        WeappTailwindcss({
          generator: { target: 'weapp' },
          tailwindcssBasedir: tailwindcss4Basedir,
          cssEntries: [path.join(root, 'index.css')],
        }),
      ],
      resolve: {
        alias: [
          { find: /^tailwindcss$/, replacement: path.join(tailwindcss4Basedir, 'index.css') },
          { find: /^tailwindcss\//, replacement: `${tailwindcss4Basedir}/` },
        ],
      },
      build: {
        minify: false,
        rollupOptions: {
          output: {
            assetFileNames: '[name].[ext]',
            entryFileNames: '[name].js',
            chunkFileNames: '[name].js',
          },
        },
      },
    })
    expect(
      normalizeTailwindcssBanner(
        await readBuiltStyle(root),
      ),
    ).toMatchSnapshot('css')
    expect(await fs.readFile(path.resolve(fixturesRootPath, 'v4-vite-plugin/dist/index.js'), 'utf-8')).toMatchSnapshot('js')
  })

  it('v4-vite-postcss', async () => {
    const root = path.resolve(fixturesRootPath, 'v4-vite-postcss')
    await build({
      root,
      plugins: [
        WeappTailwindcss({
          generator: { target: 'weapp' },
          tailwindcssBasedir: tailwindcss4Basedir,
          cssEntries: [path.join(root, 'index.css')],
        }),
      ],
      build: {
        minify: false,
        rollupOptions: {
          output: {
            assetFileNames: '[name].[ext]',
            entryFileNames: '[name].js',
            chunkFileNames: '[name].js',
          },
        },
      },
      css: {
        postcss: {
          plugins: [
            tailwindcss(
              {
                base: root,
              },
            ),
          ],
        },
      },
    })
    expect(
      normalizeTailwindcssBanner(
        await readBuiltStyle(root),
      ),
    ).toMatchSnapshot('css')
    expect(await fs.readFile(path.resolve(fixturesRootPath, 'v4-vite-postcss/dist/index.js'), 'utf-8')).toMatchSnapshot('js')
  })

  it('passes generated css through Vite PostCSS plugins', async () => {
    const root = await mkdtemp(path.join(fixturesRootPath, 'v4-vite-generated-postcss-'))
    await writeFile(path.join(root, 'index.html'), [
      '<div class="bg-clip-text"></div>',
      '<script type="module" src="./index.ts"></script>',
    ].join('\n'))
    await writeFile(path.join(root, 'index.ts'), 'import "./index.css"\n')
    await writeFile(path.join(root, 'index.css'), [
      '@import "tailwindcss";',
      '@source inline("bg-clip-text");',
    ].join('\n'))

    try {
      await build({
        root,
        plugins: [
          WeappTailwindcss({
            tailwindcssBasedir: tailwindcss4Basedir,
          }),
        ],
        build: {
          minify: false,
          rollupOptions: {
            output: {
              assetFileNames: '[name].[ext]',
              entryFileNames: '[name].js',
              chunkFileNames: '[name].js',
            },
          },
        },
        css: {
          postcss: {
            plugins: [
              {
                postcssPlugin: 'test-prefix-generated-background-clip',
                Declaration(decl) {
                  if (decl.prop === 'background-clip' && decl.value === 'text') {
                    decl.cloneBefore({ prop: '-webkit-background-clip' })
                  }
                },
              },
            ],
          },
        },
      })

      const css = await readBuiltStyle(root)
      expect(css).toContain('.bg-clip-text')
      expect(css).toContain('-webkit-background-clip: text')
      expect(css).toContain('background-clip: text')
      expect(css).not.toContain('weapp-tailwindcss vite-generated-css')
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  }, 120_000)
})
