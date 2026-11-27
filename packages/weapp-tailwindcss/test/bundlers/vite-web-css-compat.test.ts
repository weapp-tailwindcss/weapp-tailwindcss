import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  resolveViteWebCssCompatConfigurationForTarget,
  shouldApplyViteWebCssCompat,
} from '@/bundlers/vite/web-css-compat'

describe('Vite Web CSS compatibility targets', () => {
  it('prefers policy targets, then cssTarget, then build.target', () => {
    const explicit = resolveViteWebCssCompatConfigurationForTarget({
      preset: 'off',
      policy: { targets: ['chrome91'] },
    }, { target: 'chrome84', cssTarget: 'chrome120' }, undefined)
    expect(explicit.target).toMatchObject({ source: 'explicit', targets: ['chrome 91'] })

    const cssTarget = resolveViteWebCssCompatConfigurationForTarget({ preset: 'off' }, {
      target: 'chrome84',
      cssTarget: 'chrome91',
    }, undefined)
    expect(cssTarget.target).toMatchObject({ source: 'vite-css-target', targets: ['chrome 91'] })

    const buildTarget = resolveViteWebCssCompatConfigurationForTarget({ preset: 'off' }, {
      target: 'chrome91',
    }, undefined)
    expect(buildTarget.target).toMatchObject({ source: 'vite-build-target', targets: ['chrome 91'] })
  })

  it('uses a project Browserslist config when Vite has no concrete browser target', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-browserslist-'))
    try {
      await writeFile(path.join(root, '.browserslistrc'), 'chrome 91\n')
      const resolved = resolveViteWebCssCompatConfigurationForTarget({ preset: 'off' }, {
        target: 'modules',
      }, root)

      expect(resolved.target).toMatchObject({ source: 'browserslist', targets: ['chrome 91'] })
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('treats cssTarget false as an explicit request without target fallback', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'weapp-tw-browserslist-disabled-'))
    try {
      await writeFile(path.join(root, '.browserslistrc'), 'chrome 91\n')
      const resolved = resolveViteWebCssCompatConfigurationForTarget({ preset: 'off' }, {
        target: 'chrome84',
        cssTarget: false,
      }, root)

      expect(resolved.target).toBeUndefined()
    }
    finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('does not activate compatibility just because Vite has a target', () => {
    const context = {
      currentGeneratorBranch: { isWeb: true },
      currentGeneratorOptions: { webCompat: undefined },
      webCssTarget: { source: 'vite-build-target', targets: ['chrome 91'] },
    } as any

    expect(shouldApplyViteWebCssCompat(context, {
      generation: { shouldApplyWebCssCompat: () => true },
    })).toBe(false)
  })
})
