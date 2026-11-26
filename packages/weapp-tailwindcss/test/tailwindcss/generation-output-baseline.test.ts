import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { transformWebCssCompat } from '@weapp-tailwindcss/postcss'
import { describe, expect, it } from 'vitest'
import { createTailwindV4Engine, resolveTailwindV4Source } from '@/tailwindcss/v4-engine'

const require = createRequire(import.meta.url)
const tailwindcssRoot = path.dirname(require.resolve('tailwindcss/package.json'))
const candidates = [
  'container',
  'flex',
  'grid',
  'p-4',
  'text-[#123456]',
  'w-[123px]',
]

function digest(css: string) {
  return createHash('sha256').update(css).digest('hex')
}

async function createFixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-generation-baseline-'))
  await mkdir(path.join(root, 'node_modules'), { recursive: true })
  await symlink(
    tailwindcssRoot,
    path.join(root, 'node_modules', 'tailwindcss'),
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  return root
}

describe('generation output baselines', () => {
  it('keeps Web, uni-app H5 compatibility and mini-program output stable', async () => {
    const root = await createFixture()
    try {
      const source = await resolveTailwindV4Source({
        css: '@import "tailwindcss" source(none);',
        base: root,
        packageName: 'tailwindcss',
      })
      const engine = createTailwindV4Engine(source)
      try {
        const web = await engine.generate({ target: 'web', candidates, scanSources: false })
        const h5 = transformWebCssCompat(web.css, true)
        const weapp = await engine.generate({ target: 'weapp', candidates, scanSources: false })

        expect({
          web: {
            digest: digest(web.css),
            hasLayer: web.css.includes('@layer'),
            hasContainer: web.css.includes('.container'),
            classSet: [...web.classSet].sort(),
          },
          h5: {
            digest: digest(h5),
            hasLayer: h5.includes('@layer'),
            hasContainer: h5.includes('.container'),
          },
          weapp: {
            digest: digest(weapp.css),
            hasLayer: weapp.css.includes('@layer'),
            hasContainer: weapp.css.includes('.container'),
            classSet: [...weapp.classSet].sort(),
            hasMiniProgramScope: weapp.css.includes('page,.tw-root,wx-root-portal-content,:host'),
          },
        }).toMatchInlineSnapshot(`
      {
        "h5": {
          "digest": "e35b7a4e610a5259c28e32162c55066b164735a1d47e6ff1eecf5f026c5b7180",
          "hasContainer": true,
          "hasLayer": false,
        },
        "weapp": {
          "classSet": [
            "container",
            "flex",
            "grid",
            "p-4",
            "text-[#123456]",
            "w-[123px]",
          ],
          "digest": "59845feb25008072c78126e1d62e7d01072d8b15240434ff5643f1b6e7317e57",
          "hasContainer": false,
          "hasLayer": false,
          "hasMiniProgramScope": true,
        },
        "web": {
          "classSet": [
            "container",
            "flex",
            "grid",
            "p-4",
            "text-[#123456]",
            "w-[123px]",
          ],
          "digest": "ee6a21c4a1853f674066bc98406dc02b5d488c1b9972744262163f6dcb5094e3",
          "hasContainer": true,
          "hasLayer": true,
        },
      }
    `)
      }
      finally {
        await engine.dispose?.()
      }
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
