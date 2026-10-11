import type { OutputAsset } from 'rollup'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createViteCssMemory } from '@/bundlers/vite/css-memory'
import { resolveAssetSourceFile } from '@/bundlers/vite/generate-bundle/css-assets'
import { createViteRuntimeClassSet } from '@/bundlers/vite/runtime-class-set'
import { disposeCompilerOwner } from '@/compiler'
import { getCompilerContext } from '@/context'
import { generateTailwindV4Css } from '@/generation/service'

function asset(originalFileNames: string[]): OutputAsset {
  return { type: 'asset', fileName: 'assets/card-12345678.css', names: ['card.css'], originalFileNames, source: '.probe{color:red}' }
}

describe('Vite CSS 资产的项目来源身份', () => {
  it.each([
    ['/workspace', 'feature/card.uvue', '/workspace/feature/card.uvue'],
    ['/workspace', '/other/card.uvue', '/other/card.uvue'],
    ['C:\\workspace', 'feature\\card.uvue', 'C:\\workspace\\feature\\card.uvue'],
    ['D:\\workspace', 'feature/card.uvue', 'D:\\workspace\\feature\\card.uvue'],
    ['C:\\workspace', 'D:\\other\\card.uvue', 'D:\\other\\card.uvue'],
    ['/', 'feature/card.uvue', '/feature/card.uvue'],
    ['workspace', 'feature/card.uvue', path.resolve('workspace', 'feature/card.uvue')],
  ])('来源 %s + %s 使用项目根目录，保持源码身份', (root, source, expected) => {
    expect(resolveAssetSourceFile(asset([source]), 'assets/card-12345678.css', root)).toBe(expected)
  })

  it('没有来源元数据时保留产物名，不把输出路径推断成源码', () => {
    expect(resolveAssetSourceFile(asset([]), 'assets/card-12345678.css', '/workspace')).toBe('assets/card-12345678.css')
  })

  it('连续回放原始 SFC style 后仍从其源码目录解析 reference，并采纳作者样式变化', async () => {
    const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-css-source-')))
    const entry = path.join(root, 'theme.css')
    const sourceFile = path.join(root, 'feature', 'card.uvue')
    let style = '@reference "../theme.css"; .probe { @apply bg-brand; }'
    let source = `<template><view class="probe" /></template><style>${style}</style>`
    await fs.symlink(path.resolve(__dirname, '../../../../node_modules'), path.join(root, 'node_modules'), 'junction')
    await fs.mkdir(path.dirname(sourceFile))
    await fs.writeFile(sourceFile, source)
    await fs.writeFile(entry, '@import "tailwindcss" source(none); @theme { --color-brand: #123456; }')
    const ctx = getCompilerContext({ tailwindcssBasedir: root, cssEntries: [entry], generator: { target: 'web' } })
    const manager = createViteRuntimeClassSet({
      opts: ctx,
      initialTailwindRuntime: ctx.tailwindRuntime,
      refreshTailwindcssRuntime: ctx.refreshTailwindcssRuntime,
      uniAppXEnabled: false,
      customAttributesEntities: [],
      disabledDefaultTemplateHandler: false,
      debug: () => {},
    })
    const memory = createViteCssMemory({ debug: () => {}, getSourceCandidateSource: file => file === sourceFile ? source : undefined })
    try {
      const resolved = resolveAssetSourceFile(asset(['feature/card.uvue']), 'assets/card-12345678.css', root)
      memory.rememberCssSource({ outputFile: 'assets/card-12345678.css', rawSource: '.probe{color:red}', sourceFile: resolved })
      for (const [candidate, property] of [['bg-brand', 'background-color'], ['text-brand', 'color'], ['bg-brand', 'background-color']]) {
        style = `@reference "../theme.css"; .probe { @apply ${candidate}; }`
        source = `<template><view class="probe" /></template><style>${style}</style>`
        await fs.writeFile(sourceFile, source)
        manager.invalidateRuntimeClassSet()
        const runtime = await manager.ensureRuntimeClassSet()
        await memory.refreshRememberedCssSourceByCurrentFile(sourceFile)
        const remembered = [...memory.getRememberedCssSources().values()][0]!
        expect(remembered.rawSource).toBe(style)
        const generated = await generateTailwindV4Css({
          opts: ctx,
          runtimeState: manager.runtimeState,
          runtime,
          rawSource: remembered.rawSource,
          file: remembered.sourceFile,
          cssHandlerOptions: { isMainChunk: false, postcssOptions: { options: { from: remembered.sourceFile } } },
          styleHandler: ctx.styleHandler,
          debug: () => {},
        })
        expect(generated?.css).toContain('#123456')
        expect(generated?.css).toContain(`${property}:`)
        if (candidate === 'text-brand') {
          expect(generated?.css).not.toContain('background-color:')
        }
        expect(generated?.css).not.toContain('@reference')
      }
    }
    finally {
      memory.dispose()
      await disposeCompilerOwner(manager.runtimeState)
      manager.runtimeState.dispose()
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
