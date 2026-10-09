import type { RollupWatcher } from 'rollup'
import { createHash } from 'node:crypto'
import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { build } from 'vite'
import { describe, expect, it, vi } from 'vitest'
import { stripBundlerGeneratedCssMarkers } from '@/bundlers/shared/generated-css-marker'
import { WeappTailwindcss } from '@/bundlers/vite'

function cssIdentity(css: string) {
  // Vite 的内部版本标记不属于写入磁盘的 CSS 内容。
  return stripBundlerGeneratedCssMarkers(css)
}

function cssHash(css: string) {
  return createHash('sha256').update(cssIdentity(css)).digest('hex').slice(0, 16)
}

describe('uni-app X H5 watch 的 CSS 资产身份', () => {
  it.each([true, false])('连续生产增量仍在 hash 前重排 reset，拆分=%s', async (cssCodeSplit) => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'uni-app-x-css-watch-')))
    let watcher: RollupWatcher | undefined
    const snapshots: { css: string, cssFiles: string[], fileName: string, references: string }[] = []
    let completed = 0
    let failure: unknown
    try {
      await symlink(path.resolve('node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
      await writeFile(path.join(root, 'index.html'), '<script type="module" src="./entry.js"></script>')
      await writeFile(path.join(root, 'entry.js'), 'import "./theme.css";import "./framework.css";')
      await writeFile(path.join(root, 'theme.css'), '@import "tailwindcss" source(none);@source inline("border-solid border border-2");')
      const frameworkFile = path.join(root, 'framework.css')
      await writeFile(frameworkFile, 'uni-app uni-view{border-width:medium;color:red}')
      watcher = await build({
        root,
        configFile: false,
        logLevel: 'silent',
        plugins: [
          WeappTailwindcss({
            appType: 'uni-app-x',
            tailwindcssBasedir: root,
            cssEntries: [path.join(root, 'theme.css')],
            generator: { target: 'web' },
          }),
          {
            name: 'observe-final-css',
            enforce: 'post',
            generateBundle: {
              order: 'post',
              handler(_options, bundle) {
                const html = Object.values(bundle).find(output => output.type === 'asset' && output.fileName.endsWith('.html'))
                const asset = Object.values(bundle).find(output => output.type === 'asset'
                  && output.fileName.endsWith('.css')
                  && (html?.type !== 'asset' || String(html.source).includes(output.fileName)))
                if (asset?.type !== 'asset') {
                  throw new Error('增量构建缺少 CSS 产物')
                }
                snapshots.push({
                  css: String(asset.source),
                  cssFiles: Object.values(bundle).filter(output => output.type === 'asset' && output.fileName.endsWith('.css')).map(output => output.fileName),
                  fileName: asset.fileName,
                  references: Object.values(bundle).map(output => output.type === 'chunk' ? output.code : String(output.source)).join('\n'),
                })
              },
            },
          },
        ],
        build: {
          write: false,
          watch: {},
          cssCodeSplit,
          cssMinify: true,
          rollupOptions: {
            output: {
              assetFileNames(asset) {
                if ((asset.names?.[0] ?? asset.name)?.endsWith('.css')) {
                  const fileName = `assets/style-${cssHash(String(asset.source))}.css`
                  return fileName
                }
                return 'assets/[name]-[hash][extname]'
              },
            },
          },
        },
      }) as RollupWatcher
      watcher.on('event', (event) => {
        if (event.code === 'END') {
          completed++
        }
        if (event.code === 'ERROR') {
          failure = event.error
        }
      })
      for (const [index, color] of ['red', 'blue', 'green'].entries()) {
        if (index > 0) {
          await writeFile(frameworkFile, `uni-app uni-view{border-width:medium;color:${color}}`)
        }
        await vi.waitFor(() => {
          if (failure) {
            throw failure
          }
          expect(completed).toBeGreaterThan(index)
        }, { timeout: 20_000, interval: 30 })
        const output = snapshots[index]!
        expect(output.fileName).toBe(`assets/style-${cssHash(output.css)}.css`)
        expect(output.css.match(/uni-app uni-ad-draw/g), output.css).toHaveLength(1)
        expect(output.css.indexOf('uni-app uni-ad-draw')).toBeGreaterThan(output.css.indexOf('medium'))
        expect(output.references).toContain(output.fileName)
        if (index > 0) {
          expect(output.fileName).not.toBe(snapshots[index - 1]!.fileName)
          expect(output.cssFiles).not.toContain(snapshots[index - 1]!.fileName)
        }
      }
      expect(snapshots).toHaveLength(3)
      expect(failure).toBeUndefined()
    }
    finally {
      await watcher?.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
