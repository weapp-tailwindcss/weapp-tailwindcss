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

interface CssSnapshot {
  css: string
  cssFiles: string[]
  fileName: string
  references: string
}

describe('uni-app X H5 watch 的 CSS 资产身份', () => {
  it.each([true, false])('连续生产增量仍在 hash 前重排 reset，拆分=%s', async (cssCodeSplit) => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'uni-app-x-css-watch-')))
    let watcher: RollupWatcher | undefined
    const snapshots: CssSnapshot[] = []
    const pendingSnapshots: CssSnapshot[] = []
    const inputSnapshots: CssSnapshot[] = []
    let failure: unknown
    const waitForSnapshot = async (offset: number, matches: (snapshot: CssSnapshot) => boolean, input: string) => {
      let selected: CssSnapshot | undefined
      await vi.waitFor(() => {
        if (failure) {
          throw failure
        }
        selected = snapshots.slice(offset).find(matches)
        expect(selected, `未找到本轮输入 ${input} 的已完成产物`).toBeDefined()
      }, { timeout: 20_000, interval: 30 })
      return selected!
    }
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
                pendingSnapshots.push({
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
          snapshots.push(...pendingSnapshots.splice(0))
        }
        if (event.code === 'ERROR') {
          failure = event.error
        }
      })
      for (const [index, color] of ['red', 'blue', 'green'].entries()) {
        const snapshotOffset = snapshots.length
        if (index > 0) {
          await writeFile(frameworkFile, `uni-app uni-view{border-width:medium;color:${color}}`)
        }
        // 通过本轮写入的内容确认归属；额外的合法重建不能提前满足下一轮输入。
        const expectedColor = new RegExp(`color:(?:${color === 'blue' ? 'blue|#00f' : color})(?=[;}])`)
        const output = await waitForSnapshot(snapshotOffset, snapshot => expectedColor.test(snapshot.css), color)
        inputSnapshots.push(output)
        expect(output.css).toMatch(expectedColor)
        expect(output.fileName).toBe(`assets/style-${cssHash(output.css)}.css`)
        expect(output.css.match(/uni-app uni-ad-draw/g), output.css).toHaveLength(1)
        expect(output.css.indexOf('uni-app uni-ad-draw')).toBeGreaterThan(output.css.indexOf('medium'))
        expect(output.references).toContain(output.fileName)
        expect(output.cssFiles).toEqual([output.fileName])
        if (index > 0) {
          expect(output.fileName).not.toBe(inputSnapshots[index - 1]!.fileName)
          expect(output.cssFiles).not.toContain(inputSnapshots[index - 1]!.fileName)
        }
        if (index === 0) {
          const scriptSnapshotOffset = snapshots.length
          // 合法的脚本增量不改变 CSS，不能把其完成事件认作下一次样式输入。
          await writeFile(path.join(root, 'entry.js'), 'import "./theme.css";import "./framework.css";console.log("script-only update");')
          const scriptOutput = await waitForSnapshot(scriptSnapshotOffset, snapshot => snapshot.references.includes('script-only update'), 'script-only update')
          expect(scriptOutput.css).toBe(output.css)
          expect(scriptOutput.fileName).toBe(output.fileName)
          expect(scriptOutput.cssFiles).toEqual([output.fileName])
        }
      }
      expect(inputSnapshots).toHaveLength(3)
      expect(failure).toBeUndefined()
    }
    finally {
      await watcher?.close()
      await rm(root, { recursive: true, force: true })
    }
  }, 60_000)
})
