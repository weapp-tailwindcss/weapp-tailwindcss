import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { MappingChars2String } from '@weapp-tailwindcss/escape'
import { describe, expect, it } from 'vitest'
import { transformLiteralText } from '@/js'
import { collectRuntimeClassSet } from '@/tailwindcss/runtime'
import { createTailwindcssRuntimeForBase } from '@/tailwindcss/v4'
import { createTemplateHandler } from '@/wxml'

describe('tailwindcss/v4 runtime integration with @config + cssEntries', () => {
  it('preserves entry base, collects class set, and escapes runtime literals', async () => {
    const workspaceRoot = path.resolve(__dirname, '../../../../..')
    const fixtureRoot = path.resolve(__dirname, '../../fixtures/tailwind-v4-config-import')
    const cssEntry = path.resolve(fixtureRoot, 'src/app.css')
    const fixtureModules = path.resolve(fixtureRoot, 'node_modules')
    const tailwindcss4Path = path.resolve(workspaceRoot, 'node_modules/tailwindcss')
    const fixtureTailwindcss = path.resolve(fixtureModules, 'tailwindcss')

    await fs.mkdir(fixtureModules, { recursive: true })
    try {
      await fs.rm(fixtureTailwindcss, { recursive: true, force: true })
    }
    catch {}
    await fs.symlink(tailwindcss4Path, fixtureTailwindcss, 'dir')

    const runtime = createTailwindcssRuntimeForBase(fixtureRoot, [cssEntry], {
      tailwindcss: {
        packageName: 'tailwindcss4',
        version: 4,
        resolve: {
          paths: [path.resolve(workspaceRoot, 'node_modules')],
        },
      },
      tailwindcssRuntimeOptions: undefined,
      supportCustomLengthUnits: true,
      appType: 'taro',
    } as any)

    await runtime.extract({ write: false })

    const classSet = await collectRuntimeClassSet(runtime, { force: true })

    expect(classSet.has('px-[48rpx]')).toBe(true)

    const transformed = transformLiteralText('px-[48rpx] text-white', {
      classNameSet: classSet,
      arbitraryValues: { allowDoubleQuotes: true },
      alwaysEscape: false,
      unescapeUnicode: true,
    } as any)

    expect(transformed).toContain('px-_b48rpx_B')
    expect(transformed).not.toContain('px-[48rpx]')
  })

  it('keeps generated v4 class set aligned with JS and WXML escaping after mini-program adaptation', async () => {
    const workspaceRoot = path.resolve(__dirname, '../../../../..')
    const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tw-v4-post-tailwind-sync-'))
    const cssEntry = path.resolve(fixtureRoot, 'src/app.css')
    const template = path.resolve(fixtureRoot, 'src/pages/index/index.wxml')

    try {
      await fs.mkdir(path.dirname(template), { recursive: true })
      await fs.writeFile(
        cssEntry,
        [
          '@import "tailwindcss" source(none);',
          '@source "./pages/**/*.{wxml,html,js,ts}";',
        ].join('\n'),
        'utf8',
      )
      await fs.writeFile(
        template,
        [
          '<view class="text-[22rpx] hover:text-[22rpx] bg-[color:#123456] ',
          '{{ active ? \'text-[22rpx]\' : \'bg-[color:#123456]\' }}">post tailwind sync</view>',
        ].join(''),
        'utf8',
      )

      const runtime = createTailwindcssRuntimeForBase(fixtureRoot, [cssEntry], {
        tailwindcss: {
          packageName: 'tailwindcss4',
          version: 4,
          resolve: {
            paths: [path.resolve(workspaceRoot, 'node_modules')],
          },
        },
        tailwindcssRuntimeOptions: undefined,
        supportCustomLengthUnits: true,
        appType: 'native',
      } as any)

      const classSet = await collectRuntimeClassSet(runtime, {
        clearCache: true,
        force: true,
      })

      expect(classSet.has('text-[22rpx]')).toBe(true)
      expect(classSet.has('hover:text-[22rpx]')).toBe(true)
      expect(classSet.has('bg-[color:#123456]')).toBe(true)

      const transformedJs = transformLiteralText(
        'text-[22rpx] hover:text-[22rpx] bg-[color:#123456]',
        {
          classNameSet: classSet,
          arbitraryValues: { allowDoubleQuotes: true },
          alwaysEscape: false,
          escapeMap: MappingChars2String,
          unescapeUnicode: true,
        } as any,
      )
      expect(transformedJs).toContain('text-_b22rpx_B')
      expect(transformedJs).toContain('hover_ctext-_b22rpx_B')
      expect(transformedJs).toContain('bg-_bcolor_c_h123456_B')
      expect(transformedJs).not.toContain('text-[22rpx]')
      expect(transformedJs).not.toContain('hover:text-[22rpx]')
      expect(transformedJs).not.toContain('bg-[color:#123456]')

      const templateHandler = createTemplateHandler({
        escapeMap: MappingChars2String,
      })
      const transformedWxml = await templateHandler(await fs.readFile(template, 'utf8'), {
        runtimeSet: classSet,
      })

      expect(transformedWxml).toContain('text-_b22rpx_B')
      expect(transformedWxml).toContain('hover_ctext-_b22rpx_B')
      expect(transformedWxml).toContain('bg-_bcolor_c_h123456_B')
      expect(transformedWxml).not.toContain('text-[22rpx]')
      expect(transformedWxml).not.toContain('hover:text-[22rpx]')
      expect(transformedWxml).not.toContain('bg-[color:#123456]')
    }
    finally {
      await fs.rm(fixtureRoot, { force: true, recursive: true })
    }
  })

  it('falls back to generator source scan when runtime extract returns an empty class set', async () => {
    const workspaceRoot = path.resolve(__dirname, '../../../../..')
    const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tw-v4-runtime-fallback-'))
    const cssEntry = path.resolve(fixtureRoot, 'src/app.css')
    const template = path.resolve(fixtureRoot, 'src/pages/index/index.wxml')

    try {
      await fs.mkdir(path.dirname(template), { recursive: true })
      await fs.writeFile(
        path.resolve(fixtureRoot, 'tailwind.config.js'),
        [
          'module.exports = {',
          '  content: ["./src/**/*.{wxml,html,js,ts}"],',
          '}',
        ].join('\n'),
        'utf8',
      )
      await fs.writeFile(
        cssEntry,
        [
          '@config "../tailwind.config.js";',
          '@import "tailwindcss";',
          '@source "./pages/**/*.{wxml,html,js,ts}";',
        ].join('\n'),
        'utf8',
      )
      await fs.writeFile(
        template,
        '<view class="text-[#aa11bb] bg-[#bb11aa]">runtime fallback</view>',
        'utf8',
      )
      const runtime = createTailwindcssRuntimeForBase(fixtureRoot, [cssEntry], {
        tailwindcss: {
          packageName: 'tailwindcss4',
          version: 4,
          resolve: {
            paths: [path.resolve(workspaceRoot, 'node_modules')],
          },
        },
        tailwindcssRuntimeOptions: undefined,
        supportCustomLengthUnits: true,
        appType: 'native',
      } as any)
      const originalExtract = runtime.extract.bind(runtime)
      runtime.extract = async (options) => {
        await originalExtract(options)
        return {
          classList: [],
          classSet: new Set<string>(),
        } as Awaited<ReturnType<typeof originalExtract>>
      }

      const classSet = await collectRuntimeClassSet(runtime, {
        clearCache: true,
        force: true,
      })

      expect(classSet.has('text-[#aa11bb]')).toBe(true)
      expect(classSet.has('bg-[#bb11aa]')).toBe(true)
    }
    finally {
      await fs.rm(fixtureRoot, { force: true, recursive: true })
    }
  })

  it('collects custom variant conditional comment candidates from css entries', async () => {
    const workspaceRoot = path.resolve(__dirname, '../../../../..')
    const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tw-v4-custom-variant-runtime-'))
    const cssEntry = path.resolve(fixtureRoot, 'src/tailwind.css')
    const template = path.resolve(fixtureRoot, 'src/pages/index/index.wxml')

    try {
      await fs.mkdir(path.dirname(template), { recursive: true })
      await fs.writeFile(
        cssEntry,
        [
          '@import "tailwindcss" source(none);',
          '@theme default {',
          '  --color-blue-500: oklch(62.3% 0.214 259.815);',
          '  --color-red-500: oklch(63.7% 0.237 25.331);',
          '}',
          '@custom-variant wx {',
          '  /*  #ifdef  MP-WEIXIN  */',
          '  @slot;',
          '  /*  #endif  */',
          '}',
          '@custom-variant not-wx {',
          '  /*  #ifndef  MP-WEIXIN  */',
          '  @slot;',
          '  /*  #endif  */',
          '}',
          '@source "./pages/**/*.{wxml,html,js,ts}";',
        ].join('\n'),
        'utf8',
      )
      await fs.writeFile(
        template,
        '<view class="wx:bg-blue-500 not-wx:bg-red-500">custom variant</view>',
        'utf8',
      )

      const runtime = createTailwindcssRuntimeForBase(fixtureRoot, [cssEntry], {
        tailwindcss: {
          packageName: 'tailwindcss4',
          version: 4,
          resolve: {
            paths: [path.resolve(workspaceRoot, 'node_modules')],
          },
        },
        tailwindcssRuntimeOptions: undefined,
        supportCustomLengthUnits: true,
        appType: 'native',
      } as any)

      const classSet = await collectRuntimeClassSet(runtime, {
        clearCache: true,
        force: true,
      })

      expect(classSet.has('wx:bg-blue-500')).toBe(true)
      expect(classSet.has('not-wx:bg-red-500')).toBe(true)
    }
    finally {
      await fs.rm(fixtureRoot, { force: true, recursive: true })
    }
  })

  it('collects uni-app x uvue candidates from issue #964 css entry sources', async () => {
    const workspaceRoot = path.resolve(__dirname, '../../../../..')
    const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-tw-issue-964-'))
    const cssEntry = path.resolve(fixtureRoot, 'main.css')
    const page = path.resolve(fixtureRoot, 'pages/index/index.uvue')

    try {
      await fs.mkdir(path.dirname(page), { recursive: true })
      await fs.writeFile(
        cssEntry,
        [
          '@import "tailwindcss" source(none);',
          '@source "./App.uvue";',
          '@source "./pages/**/*.{uts,uvue}";',
          '@source "./components/**/*.{uts,uvue}";',
          '@source "./stores/**/*.{uts,uvue}";',
          '@source not "./uni_modules/**/*";',
          '@source not "./unpackage/**/*";',
        ].join('\n'),
        'utf8',
      )
      await fs.writeFile(
        page,
        [
          '<template>',
          '  <view class="p-4 mt-50">',
          '    <text class="text-xl text-[#f7fbff] bg-[#102938] w-[173px]">Hello Tailwind on uni-app x</text>',
          '  </view>',
          '</template>',
        ].join('\n'),
        'utf8',
      )

      const runtime = createTailwindcssRuntimeForBase(fixtureRoot, [cssEntry], {
        tailwindcss: {
          packageName: 'tailwindcss4',
          version: 4,
          resolve: {
            paths: [path.resolve(workspaceRoot, 'node_modules')],
          },
        },
        tailwindcssRuntimeOptions: undefined,
        supportCustomLengthUnits: true,
        appType: 'uni-app-x',
      } as any)

      const classSet = await collectRuntimeClassSet(runtime, {
        clearCache: true,
        force: true,
      })

      expect(classSet.has('text-xl')).toBe(true)
      expect(classSet.has('text-[#f7fbff]')).toBe(true)
      expect(classSet.has('bg-[#102938]')).toBe(true)
      expect(classSet.has('w-[173px]')).toBe(true)
    }
    finally {
      await fs.rm(fixtureRoot, { force: true, recursive: true })
    }
  })
})
